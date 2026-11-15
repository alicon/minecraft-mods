package dev.alicon.mushroomyorkie.entity;

import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.phys.Vec3;

final class MushroomSittingPose {
	private MushroomSittingPose() {
	}

	static void setSleeping(MushroomYorkieEntity yorkie, boolean sleeping) {
		// Night sleep and creative naps must wait for a dry landing, including callers already active on entering water.
		sleeping = sleeping && MushroomYorkieStateQueries.canSleep(yorkie);
		yorkie.setSleepingData(sleeping);
		update(yorkie);
		if (sleeping) {
			yorkie.getNavigation().stop();
			if (yorkie.level() instanceof ServerLevel level) {
				BlockPos doorPos = MushroomDoorLocator.findNearestDoor(level, yorkie.blockPosition());
				if (doorPos != null) {
					facePosition(yorkie, Vec3.atBottomCenterOf(doorPos));
				}
			}
		}
	}

	static void setOrderedToSit(MushroomYorkieEntity yorkie, boolean sitting) {
		if (sitting && MushroomYorkieStateQueries.isWetForSitting(yorkie)) {
			sitting = false;
		}
		yorkie.setOrderedToSit(sitting);
		update(yorkie);
	}

	static void preventWaterRest(MushroomYorkieEntity yorkie) {
		if (!MushroomYorkieStateQueries.isWetForSitting(yorkie)) {
			return;
		}
		boolean resting = yorkie.isOrderedToSit() || yorkie.isMushroomSleeping() || yorkie.isInSittingPose();
		yorkie.setMushroomOrderedToSit(false);
		yorkie.setSleeping(false);
		if (resting) {
			MushroomBehaviorDebugger.debug(yorkie, "water_follow", "water: waking and following instead of sitting or sleeping", true);
		}
	}

	private static void update(MushroomYorkieEntity yorkie) {
		yorkie.setInSittingPose(!MushroomYorkieStateQueries.isWetForSitting(yorkie) && (yorkie.isMushroomSleeping() || yorkie.isOrderedToSit()));
	}

	private static void facePosition(MushroomYorkieEntity yorkie, Vec3 target) {
		Vec3 delta = target.subtract(yorkie.position());
		if (delta.horizontalDistanceSqr() < 1.0E-4D) {
			return;
		}

		float yaw = (float) (Math.atan2(delta.z, delta.x) * 180.0D / Math.PI) - 90.0F;
		yorkie.setYRot(yaw);
		yorkie.yBodyRot = yaw;
		yorkie.yHeadRot = yaw;
		yorkie.yRotO = yaw;
	}
}
