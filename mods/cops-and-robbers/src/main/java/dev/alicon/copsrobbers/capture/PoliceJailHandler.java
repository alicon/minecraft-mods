package dev.alicon.copsrobbers.capture;

import dev.alicon.copsrobbers.entity.BankRobberEntity;
import dev.alicon.copsrobbers.entity.CopEntity;
import dev.alicon.copsrobbers.entity.ModEntities;
import dev.alicon.copsrobbers.entity.PoliceCruiserEntity;
import java.util.List;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.phys.AABB;

final class PoliceJailHandler {
	private static final int MAX_JAILED_ROBBERS_PER_JAIL = 5;
	private static final int SPECIAL_JAILBREAKER_CHANCE = 10;

	private PoliceJailHandler() {
	}

	static void releaseAtNearbyJail(PoliceCruiserEntity cruiser) {
		if (!(cruiser.level() instanceof ServerLevel level) || cruiser.capturedRobbers() <= 0 || cruiser.tickCount % 20 != 0) {
			return;
		}

		PoliceJailDropOff dropOff = PoliceJailLayout.findDropOff(level, cruiser.blockPosition());
		if (dropOff == null) {
			if (cruiser.tickCount % 80 == 0) {
				PoliceJailMessages.showDriverMessage(cruiser, Component.literal("Captured robbers: " + cruiser.capturedRobbers() + " - park on Prisoner Drop Off"));
			}
			return;
		}

		int released = 0;
		int jailedNearby = PoliceJailLayout.jailedRobbersNear(level, dropOff.cellCenter());
		int availableCells = MAX_JAILED_ROBBERS_PER_JAIL - jailedNearby;
		if (availableCells <= 0) {
			if (cruiser.tickCount % 40 == 0) {
				PoliceJailMessages.showDriverMessage(cruiser, Component.literal("Jail is full: " + jailedNearby + "/" + MAX_JAILED_ROBBERS_PER_JAIL));
			}
			return;
		}

		int toRelease = Math.min(cruiser.capturedRobbers(), availableCells);
		for (BlockPos cellPos : PoliceJailLayout.jailStandingSpots(level, dropOff.cellCenter())) {
			if (released >= toRelease) {
				break;
			}
			if (spawnJailedRobber(level, cellPos)) {
				released++;
			}
		}

		if (released > 0) {
			cruiser.removeCapturedRobbers(released);
			level.playSound(null, cruiser.blockPosition(), SoundEvents.IRON_DOOR_OPEN, SoundSource.PLAYERS, 0.85F, 0.95F);
			PoliceJailMessages.showDriverMessage(cruiser, Component.literal(released + " robber" + (released == 1 ? "" : "s") + " sent to jail"));
			if (cruiser.capturedRobbers() > 0 && PoliceJailLayout.jailedRobbersNear(level, dropOff.cellCenter()) >= MAX_JAILED_ROBBERS_PER_JAIL) {
				PoliceJailMessages.showDriverMessage(cruiser, Component.literal("Jail is full: " + MAX_JAILED_ROBBERS_PER_JAIL + "/" + MAX_JAILED_ROBBERS_PER_JAIL));
			}
		} else if (cruiser.tickCount % 60 == 0) {
			PoliceJailMessages.showDriverMessage(cruiser, Component.literal("No open jail spots behind the bars"));
		}
	}

	static boolean isSecureJailSpot(ServerLevel level, BlockPos pos) {
		return PoliceJailLayout.isSecureJailSpot(level, pos);
	}

	static boolean tryCopReleaseServedRobbers(CopEntity cop, ServerLevel level) {
		List<BankRobberEntity> prisoners = level.getEntities(
				ModEntities.BANK_ROBBER,
				AABB.ofSize(cop.position(), 18.0D, 6.0D, 18.0D),
				BankRobberEntity::isJailed
		);
		if (prisoners.isEmpty()) {
			return false;
		}

		boolean hasSpecial = false;
		boolean allServed = true;
		for (BankRobberEntity prisoner : prisoners) {
			hasSpecial |= prisoner.isSpecialJailbreaker();
			allServed &= prisoner.hasServedFullDay(level);
		}
		if (hasSpecial || !allServed) {
			return false;
		}

		BankRobberEntity nearest = prisoners.get(0);
		for (BankRobberEntity prisoner : prisoners) {
			if (prisoner.distanceToSqr(cop) < nearest.distanceToSqr(cop)) {
				nearest = prisoner;
			}
		}
		if (cop.distanceToSqr(nearest) > 4.0D * 4.0D) {
			cop.getNavigation().moveTo(nearest, 1.0D);
			return true;
		}

		for (BankRobberEntity prisoner : prisoners) {
			prisoner.releaseFromJail();
		}
		level.playSound(null, nearest.blockPosition(), SoundEvents.IRON_DOOR_OPEN, SoundSource.NEUTRAL, 0.9F, 1.0F);
		PoliceJailMessages.alertNearbyPlayers(level, nearest.blockPosition(), Component.literal("A cop released the robbers after their day in jail."));
		return true;
	}

	static void triggerJailbreak(BankRobberEntity jailbreaker, ServerLevel level) {
		PoliceJailbreakHandler.trigger(jailbreaker, level);
	}

	private static boolean spawnJailedRobber(ServerLevel level, BlockPos pos) {
		if (!level.getEntities(ModEntities.BANK_ROBBER, AABB.ofSize(pos.getCenter(), 0.9D, 1.9D, 0.9D), BankRobberEntity::isAlive).isEmpty()) {
			return false;
		}

		BankRobberEntity robber = ModEntities.BANK_ROBBER.create(level, EntitySpawnReason.EVENT);
		if (robber == null) {
			return false;
		}

		robber.snapTo(pos.getX() + 0.5D, pos.getY() + 0.02D, pos.getZ() + 0.5D, level.random.nextFloat() * 360.0F, 0.0F);
		robber.jail(level.random.nextInt(SPECIAL_JAILBREAKER_CHANCE) == 0);
		level.addFreshEntity(robber);
		return true;
	}

}
