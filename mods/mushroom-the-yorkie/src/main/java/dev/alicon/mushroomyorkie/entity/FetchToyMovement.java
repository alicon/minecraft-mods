package dev.alicon.mushroomyorkie.entity;

import net.minecraft.world.phys.Vec3;
import net.minecraft.core.BlockPos;

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
		this.yorkie.fetchFlight.clear();
	}

	void retryNow() {
		this.nextMoveTick = 0;
		this.yorkie.fetchFlight.clear();
	}

	void moveToward(Vec3 target, double speed) {
		this.yorkie.fetchFlight.request(target);
		if (MushroomYorkieStateQueries.ownerIsCreativeFlying(this.yorkie)) {
			return;
		}
		boolean targetShifted = this.lastMoveTarget == null || this.lastMoveTarget.distanceToSqr(target) > MOVE_TARGET_REFRESH_DISTANCE_SQR;
		if (!targetShifted && this.nextMoveTick-- > 0) {
			return;
		}

		// A shoreline point is already offset from the toy. Vanilla's one-node arrival
		// tolerance can stop another block short, outside the pickup radius.
		var path = this.yorkie.getNavigation().createPath(BlockPos.containing(target), 0);
		this.yorkie.getNavigation().moveTo(path, speed);
		this.lastMoveTarget = target;
		this.nextMoveTick = MOVE_RETRY_TICKS;
	}
}
