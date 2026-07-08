package dev.alicon.copsrobbers.capture;

import dev.alicon.copsrobbers.entity.BankRobberEntity;
import dev.alicon.copsrobbers.entity.CopEntity;
import dev.alicon.copsrobbers.entity.ModEntities;
import dev.alicon.copsrobbers.entity.PoliceCruiserEntity;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/** Server-side capture and jail dropoff behavior for the police cruiser. */
public final class PoliceCaptureHandler {
	private PoliceCaptureHandler() {
	}

	/** Captures robbers swept up by a moving, driven cruiser. */
	public static void captureRobbersNear(PoliceCruiserEntity cruiser) {
		if (!(cruiser.level() instanceof ServerLevel level) || !cruiser.isVehicle() || !isMovingForCapture(cruiser)) {
			return;
		}

		boolean captured = false;
		for (BankRobberEntity robber : level.getEntities(ModEntities.BANK_ROBBER, captureSweepBox(cruiser), robber -> robber.isAlive() && !robber.isJailed())) {
			captured |= captureRobber(cruiser, robber);
		}
		if (captured) {
			level.playSound(null, cruiser.blockPosition(), SoundEvents.MACE_SMASH_GROUND, SoundSource.PLAYERS, 0.65F, 1.15F);
		}
	}

	/** Captures a robber into the cruiser and removes the roaming entity. */
	public static boolean captureRobber(PoliceCruiserEntity cruiser, BankRobberEntity robber) {
		if (!(cruiser.level() instanceof ServerLevel level) || !robber.isAlive() || robber.isJailed()) {
			return false;
		}

		awardRecoveredGold(cruiser, robber);
		cruiser.addCapturedRobber();
		robber.discard();
		level.playSound(null, cruiser.blockPosition(), SoundEvents.IRON_DOOR_CLOSE, SoundSource.PLAYERS, 0.9F, 1.25F);
		showDriverMessage(cruiser, Component.literal("Captured robbers: " + cruiser.capturedRobbers()));
		return true;
	}

	/** Releases captured robbers into a nearby barred jail cell. */
	public static void releaseAtNearbyJail(PoliceCruiserEntity cruiser) {
		PoliceJailHandler.releaseAtNearbyJail(cruiser);
	}

	private static void showDriverMessage(PoliceCruiserEntity cruiser, Component message) {
		if (cruiser.getControllingPassenger() instanceof Player driver) {
			driver.displayClientMessage(message, true);
		}
	}

	private static void awardRecoveredGold(PoliceCruiserEntity cruiser, BankRobberEntity robber) {
		if (!robber.hasStolenGold() || !(cruiser.getControllingPassenger() instanceof Player driver)) {
			return;
		}
		robber.clearStolenGold();
		ItemStack recovered = new ItemStack(Items.GOLD_INGOT);
		if (!driver.getInventory().add(recovered)) {
			driver.drop(recovered, false);
		}
		driver.displayClientMessage(Component.literal("Recovered stolen gold!"), true);
	}

	private static boolean isMovingForCapture(PoliceCruiserEntity cruiser) {
		Vec3 movement = cruiser.getDeltaMovement().multiply(1.0D, 0.0D, 1.0D);
		return movement.lengthSqr() > 0.0025D || cruiser.walkAnimation.speed() > 0.01F;
	}

	private static AABB captureSweepBox(PoliceCruiserEntity cruiser) {
		AABB box = cruiser.getBoundingBox().inflate(1.15D, 0.55D, 1.15D);
		Vec3 movement = cruiser.getDeltaMovement().multiply(1.0D, 0.0D, 1.0D);
		if (movement.lengthSqr() > 1.0E-4D) {
			box = box.expandTowards(movement.normalize().scale(1.35D))
					.minmax(box.move(movement.reverse().scale(1.35D)));
		}
		return box;
	}

	/** Returns whether a jailed robber is still enclosed by a barred cell. */
	public static boolean isSecureJailSpot(ServerLevel level, BlockPos pos) {
		return PoliceJailHandler.isSecureJailSpot(level, pos);
	}

	/** Lets a nearby cop release normal prisoners after a full Minecraft day. */
	public static boolean tryCopReleaseServedRobbers(CopEntity cop, ServerLevel level) {
		return PoliceJailHandler.tryCopReleaseServedRobbers(cop, level);
	}

	/** Starts a rare overnight breakout, damaging the cell and freeing jailed robbers nearby. */
	public static void triggerJailbreak(BankRobberEntity jailbreaker, ServerLevel level) {
		PoliceJailHandler.triggerJailbreak(jailbreaker, level);
	}
}
