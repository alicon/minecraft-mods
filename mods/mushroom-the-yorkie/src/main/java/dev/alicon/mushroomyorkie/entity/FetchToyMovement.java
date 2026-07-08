package dev.alicon.mushroomyorkie.entity;

import net.minecraft.world.phys.Vec3;

final class FetchToyMovement {
	private static final int MOVE_RETRY_TICKS = 22;
	private static final double MOVE_TARGET_REFRESH_DISTANCE_SQR = 4.0D;

	private final MushroomYorkieEntity yorkie;
	private int nextMoveTick;
	private Vec3 lastMoveTarget;

	FetchToyMovement(MushroomYorkieEntity yorkie) {
		this.yorkie = yorkie;
	}

	void reset() {
		this.nextMoveTick = 0;
		this.lastMoveTarget = null;
	}

	void retryNow() {
		this.nextMoveTick = 0;
	}

	void moveToward(Vec3 target, double speed) {
		boolean targetShifted = this.lastMoveTarget == null || this.lastMoveTarget.distanceToSqr(target) > MOVE_TARGET_REFRESH_DISTANCE_SQR;
		if (!targetShifted && this.nextMoveTick-- > 0) {
			return;
		}

		this.yorkie.getNavigation().moveTo(target.x, target.y, target.z, speed);
		this.lastMoveTarget = target;
		this.nextMoveTick = MOVE_RETRY_TICKS;
	}
}
