package dev.alicon.mushroomyorkie.entity;

import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.tags.BlockTags;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/** Uses the same physical support for holding and reclaiming native-saved perches. */
final class SquirrelPerchRecovery {
	record Perch(BlockPos tree, BlockPos approach, BlockPos climb) {
	}

	private SquirrelPerchRecovery() {
	}

	static Perch find(SquirrelEntity squirrel) {
		if (!clearBody(squirrel)) return null;
		BlockPos origin = squirrel.blockPosition();
		// Native wall contact can sit exactly on a block boundary. This small
		// horizontal tolerance admits contact, not a nearby floating squirrel.
		AABB contact = squirrel.getBoundingBox().inflate(0.02D, 0.0D, 0.02D);
		Perch highest = null;
		for (BlockPos trunk : BlockPos.betweenClosed(origin.offset(-1, -1, -1), origin.offset(1, 1, 1))) {
			if (highest != null && trunk.getY() <= highest.climb().getY()) continue;
			if (!supportedContact(squirrel, trunk, contact)) continue;
			// The saved body already reached this perch. Its old ground approach
			// may have changed without disturbing the remaining physical support.
			BlockPos tree = trunk.below(SquirrelFindTreeGoal.MIN_CLIMB_BLOCKS);
			for (Direction direction : Direction.Plane.HORIZONTAL) {
				Vec3 face = Vec3.atBottomCenterOf(trunk.relative(direction));
				if (Math.hypot(squirrel.getX() - face.x, squirrel.getZ() - face.z) <= 0.8D) {
					highest = new Perch(tree, tree.relative(direction), trunk.immutable());
					break;
				}
			}
		}
		return highest;
	}

	static boolean supports(SquirrelEntity squirrel, BlockPos trunk) {
		return clearBody(squirrel) && supportedContact(squirrel, trunk,
				squirrel.getBoundingBox().inflate(0.02D, 0.0D, 0.02D));
	}

	private static boolean clearBody(SquirrelEntity squirrel) {
		return !squirrel.onGround() && squirrel.level().noCollision(squirrel, squirrel.getBoundingBox());
	}

	private static boolean supportedContact(SquirrelEntity squirrel, BlockPos trunk, AABB contact) {
		var state = squirrel.level().getBlockState(trunk);
		if (!state.is(BlockTags.LOGS) || !SquirrelTreeClimbPolicy.reachedHeight(squirrel.getY(), trunk.getY())
				|| !hasClimbedColumn(squirrel, trunk)) return false;
		return state.getCollisionShape(squirrel.level(), trunk).toAabbs().stream()
				.anyMatch(box -> contact.intersects(box.move(trunk)));
	}

	private static boolean hasClimbedColumn(SquirrelEntity squirrel, BlockPos trunk) {
		for (int depth = 1; depth <= SquirrelFindTreeGoal.MIN_CLIMB_BLOCKS; depth++) {
			if (!squirrel.level().getBlockState(trunk.below(depth)).is(BlockTags.LOGS)) return false;
		}
		return true;
	}
}
