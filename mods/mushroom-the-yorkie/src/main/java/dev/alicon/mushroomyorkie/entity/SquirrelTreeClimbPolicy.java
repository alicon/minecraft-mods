package dev.alicon.mushroomyorkie.entity;

import net.minecraft.core.BlockPos;
import net.minecraft.world.phys.Vec3;

final class SquirrelTreeClimbPolicy {
	private static final double REACHED_HEIGHT_TOLERANCE = 0.2D;
	private static final double CLING_SPEED = 0.08D;
	private static final double MIN_DIRECTION_SQR = 1.0E-6D;

	private SquirrelTreeClimbPolicy() {
	}

	static boolean reachedHeight(double squirrelY, int targetY) {
		return squirrelY >= targetY - REACHED_HEIGHT_TOLERANCE;
	}

	static Vec3 clingMovement(Vec3 squirrelPosition, BlockPos trunkPosition) {
		double x = trunkPosition.getX() + 0.5D - squirrelPosition.x;
		double z = trunkPosition.getZ() + 0.5D - squirrelPosition.z;
		double distanceSqr = x * x + z * z;
		if (distanceSqr < MIN_DIRECTION_SQR) {
			return Vec3.ZERO;
		}

		double scale = CLING_SPEED / Math.sqrt(distanceSqr);
		return new Vec3(x * scale, 0.0D, z * scale);
	}
}
