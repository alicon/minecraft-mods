package dev.alicon.copsrobbers.entity;

import net.minecraft.world.entity.MoverType;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.phys.Vec3;

final class PoliceCruiserFlightController {
	private PoliceCruiserFlightController() {
	}

	static void tickCreativeFlightLift(PoliceCruiserEntity cruiser) {
		if (!cruiser.creativeFlightEnabled || !(cruiser.getControllingPassenger() instanceof Player driver) || !driver.isCreative()) {
			return;
		}
		cruiser.setNoGravity(true);
		float forwardInput = PoliceCruiserControlPolicy.forwardInput(driver.zza);
		float strafeInput = PoliceCruiserControlPolicy.strafeInput(driver.xxa);
		cruiser.forwardInput = forwardInput;

		Vec3 look = driver.getLookAngle();
		Vec3 horizontalForward = cruiser.forwardVector();
		Vec3 right = Vec3.directionFromRotation(0.0F, driver.getYRot() - 90.0F).normalize();
		Vec3 forward = forwardInput > 0.0F ? look : horizontalForward;
		Vec3 desired = forward.scale(forwardInput).add(right.scale(strafeInput)).add(0.0D, cruiser.creativeFlightLiftInput * 0.75D, 0.0D);
		if (desired.lengthSqr() > 1.0E-4D) {
			desired = desired.normalize().scale(PoliceCruiserGameplayConfig.CREATIVE_FLIGHT_SPEED);
		}

		Vec3 motion = cruiser.getDeltaMovement().scale(0.62D).add(desired);
		if (desired.lengthSqr() <= 1.0E-4D) {
			motion = motion.scale(0.65D);
		}
		cruiser.setDeltaMovement(motion);
		cruiser.move(MoverType.SELF, cruiser.getDeltaMovement());
	}

	static void tickTrick(PoliceCruiserEntity cruiser) {
		int ticks = cruiser.trickTicks();
		if (ticks <= 0) {
			cruiser.setTrickType(PoliceCruiserEntity.TRICK_NONE);
			return;
		}

		applyTrickMovement(cruiser, ticks);
		cruiser.setTrickTicks(ticks - 1);
		if (ticks - 1 <= 0) {
			cruiser.setTrickType(PoliceCruiserEntity.TRICK_NONE);
		}
	}

	private static void applyTrickMovement(PoliceCruiserEntity cruiser, int ticksRemaining) {
		if (!(cruiser.getControllingPassenger() instanceof Player driver) || !driver.isCreative()) {
			return;
		}

		double progress = (PoliceCruiserEntity.TRICK_DURATION_TICKS - ticksRemaining) / (double) PoliceCruiserEntity.TRICK_DURATION_TICKS;
		double lift = Math.sin(progress * Math.PI) * 0.12D;
		Vec3 forward = cruiser.forwardVector();
		if (cruiser.trickType() == PoliceCruiserEntity.TRICK_LOOP) {
			lift += Math.sin(progress * Math.PI * 2.0D) * 0.2D;
			driver.setXRot((float) Math.sin(progress * Math.PI * 2.0D) * 65.0F);
		} else if (cruiser.trickType() == PoliceCruiserEntity.TRICK_BARREL_ROLL) {
			driver.setYRot(driver.getYRot() + 18.0F);
			driver.setXRot((float) Math.sin(progress * Math.PI * 2.0D) * 28.0F);
			cruiser.setYRot(cruiser.getYRot() + 18.0F);
			cruiser.yRotO = cruiser.getYRot();
		}

		cruiser.setNoGravity(true);
		cruiser.setDeltaMovement(cruiser.getDeltaMovement().add(forward.scale(0.08D)).add(0.0D, lift, 0.0D));
	}
}
