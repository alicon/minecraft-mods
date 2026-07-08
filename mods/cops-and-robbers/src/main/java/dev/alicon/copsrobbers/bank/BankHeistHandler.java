package dev.alicon.copsrobbers.bank;

import dev.alicon.copsrobbers.entity.BankRobberEntity;
import dev.alicon.copsrobbers.entity.CopEntity;
import dev.alicon.copsrobbers.entity.ModEntities;
import dev.alicon.copsrobbers.entity.TellerEntity;
import dev.alicon.copsrobbers.fire.FireResponseHandler;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/** Shared bank robbery behavior for robbers, tellers, and cops. */
public final class BankHeistHandler {
	private static final double TELLER_PANIC_RADIUS = 14.0D;
	private static final double COP_CHASE_RADIUS = 32.0D;
	private static final double HIDEOUT_SEARCH_RADIUS = 56.0D;
	private static final double HIDEOUT_SETTLE_RADIUS = 3.25D;

	private BankHeistHandler() {
	}

	/** Lets a robber steal gold from a nearby bank vault and start a fire after leaving. */
	public static void tickRobber(BankRobberEntity robber, ServerLevel level) {
		if (robber.isJailed()) {
			return;
		}

		if (robber.hasStolenGold()) {
			moveToHideoutOrBurnBank(robber, level);
			return;
		}

		if (isNight(level)) {
			robber.setTarget(null);
			moveTowardHideout(robber, level, 1.05D);
			return;
		}

		if (!isBankRobberyTime(level) || !robber.canRobToday(level)) {
			moveTowardHideout(robber, level, 0.85D);
			return;
		}

		if (BankVaults.stealGoldFromVaultChest(level, robber.blockPosition())) {
			robber.stealGold();
			alertPlayers(level, robber.blockPosition(), Component.literal("Bank alarm! A robber stole gold!"));
			level.playSound(null, robber.blockPosition(), SoundEvents.BELL_BLOCK, SoundSource.HOSTILE, 1.0F, 1.7F);
			panicTellers(level, robber.position());
		}
	}

	/** Teller panic movement away from robbers. */
	public static void tickTeller(TellerEntity teller, ServerLevel level) {
		BankRobberEntity robber = nearestFreeRobber(level, teller.position(), TELLER_PANIC_RADIUS);
		if (robber == null) {
			teller.returnToCounter(level);
			return;
		}

		Vec3 away = teller.position().subtract(robber.position()).multiply(1.0D, 0.0D, 1.0D);
		if (away.lengthSqr() < 0.01D) {
			away = Vec3.directionFromRotation(0.0F, teller.getRandom().nextFloat() * 360.0F);
		}
		Vec3 target = teller.position().add(away.normalize().scale(9.0D));
		teller.getNavigation().moveTo(target.x, target.y, target.z, 1.35D);
	}

	/** Cop chase behavior, intentionally a little too slow to catch robbers. */
	public static void tickCop(CopEntity cop, ServerLevel level) {
		if (FireResponseHandler.tryExtinguishNearby(cop, level, 12) || dev.alicon.copsrobbers.capture.PoliceCaptureHandler.tryCopReleaseServedRobbers(cop, level)) {
			return;
		}

		BankRobberEntity robber = nearestFreeRobber(level, cop.position(), COP_CHASE_RADIUS);
		if (robber != null) {
			cop.getNavigation().moveTo(robber, 1.18D);
			return;
		}

		BlockPos station = nearestPoliceStation(level, cop.blockPosition());
		if (station != null && cop.distanceToSqr(station.getCenter()) > 9.0D) {
			cop.getNavigation().moveTo(station.getX() + 0.5D, station.getY(), station.getZ() + 0.5D, 0.9D);
		}
	}

	private static void panicTellers(ServerLevel level, Vec3 center) {
		for (TellerEntity teller : level.getEntities(ModEntities.TELLER, AABB.ofSize(center, 24.0D, 8.0D, 24.0D), TellerEntity::isAlive)) {
			teller.panicFor(120);
		}
	}

	private static BankRobberEntity nearestFreeRobber(ServerLevel level, Vec3 center, double radius) {
		BankRobberEntity nearest = null;
		double nearestDistance = Double.MAX_VALUE;
		for (BankRobberEntity robber : level.getEntities(ModEntities.BANK_ROBBER, AABB.ofSize(center, radius * 2.0D, 8.0D, radius * 2.0D), robber -> robber.isAlive() && !robber.isJailed())) {
			double distance = robber.distanceToSqr(center);
			if (distance < nearestDistance) {
				nearest = robber;
				nearestDistance = distance;
			}
		}
		return nearest;
	}

	private static void moveToHideoutOrBurnBank(BankRobberEntity robber, ServerLevel level) {
		BlockPos hideout = BankHideoutLocator.nearestHideout(level, robber.blockPosition(), HIDEOUT_SEARCH_RADIUS);
		if (hideout != null) {
			if (robber.distanceToSqr(hideout.getCenter()) <= HIDEOUT_SETTLE_RADIUS * HIDEOUT_SETTLE_RADIUS) {
				robber.chillAtHideout(level);
				level.playSound(null, robber.blockPosition(), SoundEvents.CHEST_CLOSE, SoundSource.HOSTILE, 0.75F, 0.8F);
				return;
			}
			robber.getNavigation().moveTo(hideout.getX() + 0.5D, hideout.getY(), hideout.getZ() + 0.5D, 1.05D);
		}
		if (!BankVaults.nearVaultChest(level, robber.blockPosition()) && !robber.hasLitBankFire()) {
			robber.markBankFireLit();
			BankHeistFires.lightBankFire(level, robber.blockPosition());
		}
	}

	private static void moveTowardHideout(BankRobberEntity robber, ServerLevel level, double speed) {
		BlockPos hideout = BankHideoutLocator.nearestHideout(level, robber.blockPosition(), HIDEOUT_SEARCH_RADIUS);
		if (hideout == null) {
			return;
		}
		if (robber.distanceToSqr(hideout.getCenter()) <= HIDEOUT_SETTLE_RADIUS * HIDEOUT_SETTLE_RADIUS) {
			robber.getNavigation().stop();
			return;
		}
		robber.getNavigation().moveTo(hideout.getX() + 0.5D, hideout.getY(), hideout.getZ() + 0.5D, speed);
	}

	private static boolean isBankRobberyTime(ServerLevel level) {
		long dayTime = level.getDayTime() % 24000L;
		return dayTime >= 1000L && dayTime <= 12000L;
	}

	private static boolean isNight(ServerLevel level) {
		long dayTime = level.getDayTime() % 24000L;
		return dayTime >= 13000L && dayTime <= 23000L;
	}

	private static BlockPos nearestPoliceStation(ServerLevel level, BlockPos center) {
		for (BlockPos pos : BlockPos.betweenClosed(center.offset(-32, -4, -32), center.offset(32, 5, 32))) {
			if (level.getBlockState(pos).is(Blocks.IRON_BARS)) {
				return pos.immutable();
			}
		}
		return null;
	}

	private static void alertPlayers(ServerLevel level, BlockPos center, Component message) {
		for (Player player : level.players()) {
			if (player.distanceToSqr(center.getCenter()) <= 96.0D * 96.0D) {
				player.displayClientMessage(message, true);
			}
		}
	}
}
