package dev.alicon.copsrobbers.entity;

import dev.alicon.copsrobbers.capture.PoliceCaptureHandler;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

final class PoliceCruiserImpactHandler {
	private PoliceCruiserImpactHandler() {
	}

	static void handleFrontImpact(PoliceCruiserEntity cruiser) {
		if (!cruiser.isVehicle()) {
			return;
		}

		double horizontalSpeed = cruiser.getDeltaMovement().multiply(1.0D, 0.0D, 1.0D).length();
		if (horizontalSpeed < PoliceCruiserGameplayConfig.IMPACT_MIN_SPEED && Math.abs(cruiser.forwardInput) <= 0.05F) {
			return;
		}

		AABB entityCrashBox = entityCrashImpactBox(cruiser);
		AABB blockCrashBox = frontImpactBox(cruiser);
		if (!cruiser.level().noBlockCollision(cruiser, blockCrashBox)) {
			Vec3 movement = cruiser.getDeltaMovement();
			cruiser.setDeltaMovement(movement.x * -0.18D, Math.min(movement.y, 0.0D) * 0.2D, movement.z * -0.18D);
			if (cruiser.level() instanceof ServerLevel level) {
				level.playSound(null, cruiser.blockPosition(), SoundEvents.COPPER_BULB_BREAK, SoundSource.PLAYERS, 0.7F, 0.75F);
				damageCrashOccupants(cruiser, level);
			}
		}

		if (!(cruiser.level() instanceof ServerLevel level)) {
			return;
		}

		boolean hitMob = false;
		for (Entity entity : cruiser.level().getEntities(cruiser, entityCrashBox, entity -> canDamageOnImpact(cruiser, entity))) {
			if (entity instanceof LivingEntity target) {
				if (target instanceof BankRobberEntity robber && PoliceCaptureHandler.captureRobber(cruiser, robber)) {
					hitMob = true;
					continue;
				}
				if (target.invulnerableTime > 0) {
					continue;
				}
				target.hurtServer(level, cruiser.damageSources().generic(), PoliceCruiserGameplayConfig.IMPACT_DAMAGE);
				target.push(impactForwardVector(cruiser).scale(0.95D).add(0.0D, 0.25D, 0.0D));
				hitMob = true;
			}
		}
		if (hitMob) {
			level.playSound(null, cruiser.blockPosition(), SoundEvents.MACE_SMASH_GROUND, SoundSource.PLAYERS, 0.65F, 1.15F);
			damageCrashOccupants(cruiser, level);
		}
	}

	private static boolean canDamageOnImpact(PoliceCruiserEntity cruiser, Entity entity) {
		return entity instanceof LivingEntity
				&& entity != cruiser.getControllingPassenger()
				&& !entity.isPassengerOfSameVehicle(cruiser)
				&& entity.isAlive();
	}

	private static AABB frontImpactBox(PoliceCruiserEntity cruiser) {
		Vec3 center = cruiser.position().add(impactForwardVector(cruiser).scale(2.2D)).add(0.0D, 0.8D, 0.0D);
		return AABB.ofSize(center, 3.6D, 1.9D, 2.3D);
	}

	private static AABB entityCrashImpactBox(PoliceCruiserEntity cruiser) {
		AABB impact = cruiser.getBoundingBox().inflate(1.35D, 0.45D, 1.35D).minmax(frontImpactBox(cruiser));
		Vec3 movement = cruiser.getDeltaMovement();
		if (movement.lengthSqr() > 1.0E-4D) {
			impact = impact.minmax(impact.move(movement.reverse().scale(2.0D)))
					.expandTowards(movement.normalize().scale(1.6D));
		}
		return impact;
	}

	private static void damageCrashOccupants(PoliceCruiserEntity cruiser, ServerLevel level) {
		if (cruiser.crashCooldownTicks > 0) {
			return;
		}

		cruiser.crashCooldownTicks = 12;
		cruiser.hurtVehicleFromCrash(level);
		if (cruiser.getControllingPassenger() instanceof Player driver && !driver.isCreative()) {
			driver.hurtServer(level, cruiser.damageSources().flyIntoWall(), PoliceCruiserGameplayConfig.CRASH_SELF_DAMAGE);
		}
	}

	private static Vec3 impactForwardVector(PoliceCruiserEntity cruiser) {
		Vec3 movement = cruiser.getDeltaMovement().multiply(1.0D, 0.0D, 1.0D);
		if (movement.lengthSqr() > 0.0001D) {
			return movement.normalize();
		}
		if (cruiser.getControllingPassenger() instanceof Player driver) {
			Vec3 look = driver.getLookAngle().multiply(1.0D, 0.0D, 1.0D);
			if (look.lengthSqr() > 0.0001D) {
				return look.normalize();
			}
		}
		return cruiser.forwardVector();
	}
}
