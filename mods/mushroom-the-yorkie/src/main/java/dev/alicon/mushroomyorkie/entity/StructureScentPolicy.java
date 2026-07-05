package dev.alicon.mushroomyorkie.entity;

import net.minecraft.core.BlockPos;
import net.minecraft.world.phys.Vec3;

final class StructureScentPolicy {
	private StructureScentPolicy() {
	}

	static Vec3 leadPoint(Vec3 ownerPos, BlockPos targetPos, int leadAheadBlocks) {
		Vec3 direction = Vec3.atCenterOf(targetPos).subtract(ownerPos);
		Vec3 horizontal = normalizedHorizontal(direction);
		return ownerPos.add(horizontal.scale(leadAheadBlocks));
	}

	static Vec3 circleBackPoint(Vec3 ownerPos, BlockPos targetPos, int distanceBlocks) {
		Vec3 direction = Vec3.atCenterOf(targetPos).subtract(ownerPos);
		Vec3 horizontal = normalizedHorizontal(direction);
		return ownerPos.add(horizontal.scale(distanceBlocks));
	}

	static boolean withinDistance(Vec3 pos, BlockPos targetPos, int distanceBlocks) {
		return pos.distanceToSqr(Vec3.atCenterOf(targetPos)) <= (double) distanceBlocks * distanceBlocks;
	}

	static boolean shouldWaitForOwner(double yorkieOwnerDistanceSqr, int leadAheadBlocks) {
		double waitDistance = leadAheadBlocks + 10.0D;
		return yorkieOwnerDistanceSqr > waitDistance * waitDistance;
	}

	static boolean shouldReturnToOwner(double yorkieOwnerDistanceSqr, int leadAheadBlocks) {
		double returnDistance = leadAheadBlocks + 28.0D;
		return yorkieOwnerDistanceSqr > returnDistance * returnDistance;
	}

	private static Vec3 normalizedHorizontal(Vec3 vector) {
		Vec3 horizontal = new Vec3(vector.x, 0.0D, vector.z);
		if (horizontal.lengthSqr() < 1.0E-4D) {
			return new Vec3(1.0D, 0.0D, 0.0D);
		}

		return horizontal.normalize();
	}
}
