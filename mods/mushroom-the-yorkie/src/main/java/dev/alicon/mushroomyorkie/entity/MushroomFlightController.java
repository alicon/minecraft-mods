package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.pet.FlightTrickPolicy;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.phys.Vec3;

final class MushroomFlightController {
	private static final double CREATIVE_RECOVERY_FLIGHT_DISTANCE_SQ = 12.0D * 12.0D;
	private static final double CREATIVE_WATER_RECOVERY_DISTANCE_SQ = 4.0D;

	private MushroomFlightController() {
	}

	static void followFlyingOwner(MushroomYorkieEntity yorkie) {
		if (yorkie.isPassenger()) {
			if (yorkie.ownerIsCreativeFlying()) {
				yorkie.stopRiding();
				MushroomBehaviorDebugger.debug(yorkie, "vehicle_dismount", "vehicle: hopped out before creative flight", true);
			}
			yorkie.setNoGravity(false);
			updateFlightTrick(yorkie, false);
			return;
		}

		boolean flyingToOwner = shouldFlyToOwner(yorkie);
		yorkie.setNoGravity(flyingToOwner);
		boolean ownerFlying = yorkie.ownerIsCreativeFlying();
		updateFlightTrick(yorkie, flyingToOwner && ownerFlying);
		if (!flyingToOwner) {
			return;
		}
		MushroomBehaviorDebugger.debug(
				yorkie,
				ownerFlying ? "creative_flight" : "creative_recovery_flight",
				ownerFlying ? "creative flight: following flying owner" : "creative flight: recovering to creative owner",
				false
		);

		LivingEntity owner = yorkie.getOwner();
		if (owner == null || owner.level() != yorkie.level()) {
			return;
		}

		yorkie.fallDistance = 0.0F;
		Vec3 target = owner.position()
				.add(owner.getLookAngle().scale(-1.4D))
				.add(0.0D, -0.8D, 0.0D);
		Vec3 delta = target.subtract(yorkie.position());
		faceFlightTarget(yorkie, delta);
		if (delta.lengthSqr() <= MushroomYorkieEntity.CREATIVE_FLIGHT_FOLLOW_DISTANCE_SQ) {
			yorkie.setDeltaMovement(yorkie.getDeltaMovement().scale(0.6D));
			MushroomBehaviorDebugger.debug(yorkie, "creative_flight_hover", "creative flight: hovering near owner", false);
			return;
		}

		yorkie.getNavigation().stop();
		Vec3 movement = delta.normalize().scale(MushroomYorkieEntity.CREATIVE_FLIGHT_SPEED);
		yorkie.setDeltaMovement(movement);
		yorkie.hurtMarked = true;
		MushroomBehaviorDebugger.debug(yorkie, "creative_flight_move", "creative flight: closing distance to owner", false);
	}

	private static boolean shouldFlyToOwner(MushroomYorkieEntity yorkie) {
		if (yorkie.isOrderedToSit() || !yorkie.ownerIsCreative()) {
			return false;
		}
		if (yorkie.ownerIsCreativeFlying()) {
			return true;
		}
		if (yorkie.blocksCreativeRecoveryFlight()) {
			return false;
		}

		LivingEntity owner = yorkie.getOwner();
		if (owner == null || owner.level() != yorkie.level()) {
			return false;
		}

		double distanceSqr = yorkie.distanceToSqr(owner);
		if (yorkie.isUsingCreativeFlight()) {
			return distanceSqr > MushroomYorkieEntity.CREATIVE_FLIGHT_FOLLOW_DISTANCE_SQ;
		}
		if (yorkie.hasCreativeRecoveryFlightRequest()) {
			return distanceSqr > MushroomYorkieEntity.CREATIVE_FLIGHT_FOLLOW_DISTANCE_SQ;
		}
		if (yorkie.isWetForSitting()) {
			return distanceSqr > CREATIVE_WATER_RECOVERY_DISTANCE_SQ;
		}
		return distanceSqr > CREATIVE_RECOVERY_FLIGHT_DISTANCE_SQ && yorkie.getNavigation().isDone();
	}

	private static void faceFlightTarget(MushroomYorkieEntity yorkie, Vec3 delta) {
		if (delta.horizontalDistanceSqr() < 1.0E-4D) {
			return;
		}

		float yaw = (float) (Math.atan2(delta.z, delta.x) * 180.0D / Math.PI) - 90.0F;
		yorkie.setYRot(yaw);
		yorkie.yBodyRot = yaw;
		yorkie.yHeadRot = yaw;
		yorkie.yRotO = yaw;
	}

	private static void updateFlightTrick(MushroomYorkieEntity yorkie, boolean followingFlyingOwner) {
		if (!followingFlyingOwner) {
			yorkie.setFlightTrick(MushroomYorkieEntity.FLIGHT_TRICK_NONE, 0);
			return;
		}

		int ticks = yorkie.getFlightTrickTicks();
		if (ticks > 0) {
			yorkie.setFlightTrickTicks(ticks - 1);
			return;
		}

		yorkie.setFlightTrick(MushroomYorkieEntity.FLIGHT_TRICK_NONE, 0);
		boolean recentlyWalked = yorkie.level().canSeeSky(yorkie.blockPosition()) || yorkie.needs.potty() < 60;
		if (yorkie.getRandom().nextDouble() < FlightTrickPolicy.trickChance(yorkie.needs, recentlyWalked)) {
			int trickType = yorkie.getRandom().nextBoolean() ? MushroomYorkieEntity.FLIGHT_TRICK_BARREL_ROLL : MushroomYorkieEntity.FLIGHT_TRICK_LOOP;
			yorkie.setFlightTrick(trickType, MushroomYorkieEntity.FLIGHT_TRICK_DURATION_TICKS);
			MushroomBehaviorDebugger.debug(yorkie, "creative_flight_trick", "creative flight: starting trick " + trickType, true);
		}
	}
}
