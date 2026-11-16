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
		if (squirrel.onGround() || !level.noCollision(squirrel, squirrel.getBoundingBox())) return null;
		BlockPos origin = squirrel.blockPosition();
		// Native wall contact can sit exactly on a block boundary. This small
		// horizontal tolerance admits contact, not a nearby floating squirrel.
		AABB contact = squirrel.getBoundingBox().inflate(0.02D, 0.0D, 0.02D);
		for (BlockPos trunk : BlockPos.betweenClosed(origin.offset(-1, -1, -1), origin.offset(1, 1, 1))) {
			var state = level.getBlockState(trunk);
			if (!state.is(BlockTags.LOGS) || !SquirrelTreeClimbPolicy.reachedHeight(squirrel.getY(), trunk.getY())) continue;
			boolean touching = state.getCollisionShape(level, trunk).toAabbs().stream()
					.anyMatch(box -> contact.intersects(box.move(trunk)));
			if (!touching || !hasClimbedColumn(squirrel, trunk)) continue;
			// The saved body already reached this perch. Its old ground approach
			// may have changed without disturbing the remaining physical support.
			BlockPos tree = trunk.below(SquirrelFindTreeGoal.MIN_CLIMB_BLOCKS);
			for (Direction direction : Direction.Plane.HORIZONTAL) {
				Vec3 face = Vec3.atBottomCenterOf(trunk.relative(direction));
				if (Math.hypot(squirrel.getX() - face.x, squirrel.getZ() - face.z) <= 0.8D) {
					return new Perch(tree, tree.relative(direction), trunk.immutable());
				}
			}
		}
		return null;
	}

	private static boolean hasClimbedColumn(SquirrelEntity squirrel, BlockPos trunk) {
		for (int depth = 1; depth <= SquirrelFindTreeGoal.MIN_CLIMB_BLOCKS; depth++) {
			if (!squirrel.level().getBlockState(trunk.below(depth)).is(BlockTags.LOGS)) return false;
		}
		return true;
	}
}
