package dev.alicon.copsrobbers.bank;

import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;

final class BankHideoutLocator {
	private BankHideoutLocator() {
	}

	static BlockPos nearestHideout(ServerLevel level, BlockPos center, double radius) {
		BlockPos nearest = null;
		double nearestDistance = Double.MAX_VALUE;
		int range = (int) radius;
		for (BlockPos pos : BlockPos.betweenClosed(center.offset(-range, -3, -range), center.offset(range, 5, range))) {
			if (!level.getBlockState(pos).is(Blocks.CHEST) || !isHideoutChest(level, pos)) {
				continue;
			}
			BlockPos walkable = walkableHideoutSpot(level, pos);
			if (walkable == null) {
				continue;
			}
			double distance = walkable.distSqr(center);
			if (distance < nearestDistance) {
				nearest = walkable.immutable();
				nearestDistance = distance;
			}
		}
		return nearest;
	}

	private static boolean isHideoutChest(ServerLevel level, BlockPos chest) {
		int mossyBlocks = 0;
		for (BlockPos pos : BlockPos.betweenClosed(chest.offset(-5, -1, -5), chest.offset(5, 3, 5))) {
			Block block = level.getBlockState(pos).getBlock();
			if (block == Blocks.COBWEB) {
				return true;
			}
			if (block == Blocks.MOSSY_COBBLESTONE) {
				mossyBlocks++;
			}
		}
		return mossyBlocks >= 4;
	}

	private static BlockPos walkableHideoutSpot(ServerLevel level, BlockPos chest) {
		for (Direction direction : Direction.Plane.HORIZONTAL) {
			BlockPos pos = chest.relative(direction);
			if (isWalkableInterior(level, pos)) {
				return pos.immutable();
			}
		}
		for (BlockPos pos : BlockPos.betweenClosed(chest.offset(-2, 0, -2), chest.offset(2, 0, 2))) {
			if (isWalkableInterior(level, pos)) {
				return pos.immutable();
			}
		}
		return null;
	}

	private static boolean isWalkableInterior(ServerLevel level, BlockPos pos) {
		return level.isEmptyBlock(pos)
				&& level.isEmptyBlock(pos.above())
				&& !level.getBlockState(pos.below()).isAir();
	}
}
