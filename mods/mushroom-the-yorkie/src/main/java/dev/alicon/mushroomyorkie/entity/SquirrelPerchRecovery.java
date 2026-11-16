package dev.alicon.mushroomyorkie.entity;

import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.tags.BlockTags;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/** Reclaims a native-saved perch only when the current body and tree still support that state. */
final class SquirrelPerchRecovery {
	record Perch(BlockPos tree, BlockPos approach, BlockPos climb) {
	}

	private SquirrelPerchRecovery() {
	}

	static Perch find(SquirrelEntity squirrel) {
		var level = squirrel.level();
		BlockPos origin = squirrel.blockPosition();
		// Native wall contact can sit exactly on a block boundary. This small
		// horizontal tolerance admits contact, not a nearby floating squirrel.
		AABB contact = squirrel.getBoundingBox().inflate(0.02D, 0.0D, 0.02D);
		for (BlockPos trunk : BlockPos.betweenClosed(origin.offset(-1, -1, -1), origin.offset(1, 1, 1))) {
			if (!level.getBlockState(trunk).is(BlockTags.LOGS) || !contact.intersects(new AABB(trunk))) continue;
			for (int depth = 0; depth <= SquirrelFindTreeGoal.MAX_CLIMB_BLOCKS; depth++) {
				BlockPos tree = trunk.below(depth);
				if (!level.getBlockState(tree).is(BlockTags.LOGS)) break;
				for (Direction direction : Direction.Plane.HORIZONTAL) {
					BlockPos approach = tree.relative(direction);
					if (!SquirrelFindTreeGoal.isStandable(level, approach)) continue;
					BlockPos climb = SquirrelFindTreeGoal.findClimbTarget(level, tree, approach);
					if (climb == null || !SquirrelTreeClimbPolicy.reachedHeight(squirrel.getY(), climb.getY())) continue;
					Vec3 face = Vec3.atBottomCenterOf(approach);
					if (Math.hypot(squirrel.getX() - face.x, squirrel.getZ() - face.z) <= 0.8D) {
						return new Perch(tree.immutable(), approach, climb);
					}
				}
			}
		}
		return null;
	}
}
