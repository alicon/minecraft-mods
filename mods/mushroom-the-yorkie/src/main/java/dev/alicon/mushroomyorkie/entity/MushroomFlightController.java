package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.pet.FlightTrickPolicy;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.phys.Vec3;

final class MushroomFlightController {
	// Route waypoints need precise steering; the normal 2.5-block owner orbit stops too far away.
	private static final double ROUTED_FLIGHT_HOVER_DISTANCE_SQ = 0.01D;
	private static final double CREATIVE_RECOVERY_FLIGHT_DISTANCE_SQ = 12.0D * 12.0D;
	private static final double CREATIVE_WATER_RECOVERY_DISTANCE_SQ = 4.0D;

	private MushroomFlightController() {
	}

	static void followFlyingOwner(MushroomYorkieEntity yorkie) {
		if (yorkie.isPassenger()) {
			if (MushroomYorkieStateQueries.ownerIsCreativeFlying(yorkie)) {
				yorkie.dismountForOwner();
				MushroomBehaviorDebugger.debug(yorkie, "vehicle_dismount", "vehicle: hopped out before creative flight", true);
			}
			yorkie.setNoGravity(false);
			yorkie.creativeRecoveryFlight.clearRoute();
			updateFlightTrick(yorkie, false);
			return;
		}

		boolean flyingToOwner = shouldFlyToOwner(yorkie);
		yorkie.setNoGravity(flyingToOwner);
		boolean ownerFlying = MushroomYorkieStateQueries.ownerIsCreativeFlying(yorkie);
		boolean fetching = yorkie.fetchFlight.flying();
		updateFlightTrick(yorkie, flyingToOwner && ownerFlying && !fetching);
		if (!flyingToOwner) {
			yorkie.creativeRecoveryFlight.clearRoute();
			return;
		}
		MushroomBehaviorDebugger.debug(
				yorkie,
				fetching ? "creative_fetch_flight" : ownerFlying ? "creative_flight" : "creative_recovery_flight",
				fetching ? "creative flight: following fetch route" : ownerFlying ? "creative flight: following flying owner" : "creative flight: recovering to creative owner",
				false
		);

		LivingEntity owner = yorkie.getOwner();
		if (owner == null || owner.level() != yorkie.level()) {
			yorkie.creativeRecoveryFlight.clearRoute();
			return;
		}

		yorkie.fallDistance = 0.0F;
		Vec3 target;
		if (fetching || ownerFlying) {
			yorkie.creativeRecoveryFlight.clearRoute();
			target = fetching ? yorkie.fetchFlight.steeringTarget() : owner.position()
					.add(owner.getLookAngle().scale(-1.4D)).add(0.0D, -0.8D, 0.0D);
		} else {
			// A grounded owner's standing position is clear; the airborne follow offset may lie inside a bank.
			target = yorkie.creativeRecoveryFlight.steeringTarget(yorkie, owner.position());
		}
		Vec3 delta = target.subtract(yorkie.position());
		faceFlightTarget(yorkie, delta);
		double hoverDistanceSq = fetching || !ownerFlying ? ROUTED_FLIGHT_HOVER_DISTANCE_SQ : MushroomYorkieEntity.CREATIVE_FLIGHT_FOLLOW_DISTANCE_SQ;
		if (delta.lengthSqr() <= hoverDistanceSq) {
			yorkie.setDeltaMovement(yorkie.getDeltaMovement().scale(0.6D));
			MushroomBehaviorDebugger.debug(yorkie, "creative_flight_hover", "creative flight: holding position", false);
			return;
		}

		yorkie.getNavigation().stop();
		Vec3 movement = delta.normalize().scale(MushroomYorkieEntity.CREATIVE_FLIGHT_SPEED);
		yorkie.setDeltaMovement(movement);
		yorkie.hurtMarked = true;
		MushroomBehaviorDebugger.debug(yorkie, "creative_flight_move", "creative flight: closing distance to owner", false);
	}

	private static boolean shouldFlyToOwner(MushroomYorkieEntity yorkie) {
		if (yorkie.isOrderedToSit() || !MushroomYorkieStateQueries.ownerIsCreative(yorkie)) {
			return false;
		}
		if (MushroomYorkieStateQueries.ownerIsCreativeFlying(yorkie) || yorkie.fetchFlight.flying()) {
			return true;
		}
		if (yorkie.creativeRecoveryFlight.blocks()) {
			return false;
		}

		LivingEntity owner = yorkie.getOwner();
		if (owner == null || owner.level() != yorkie.level()) {
			return false;
		}

		double distanceSqr = yorkie.distanceToSqr(owner);
		if (yorkie.isNoGravity()) {
			return distanceSqr > MushroomYorkieEntity.CREATIVE_FLIGHT_FOLLOW_DISTANCE_SQ;
		}
		if (yorkie.creativeRecoveryFlight.hasRequest()) {
			return distanceSqr > MushroomYorkieEntity.CREATIVE_FLIGHT_FOLLOW_DISTANCE_SQ;
		}
		if (MushroomYorkieStateQueries.isWetForSitting(yorkie)) {
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
