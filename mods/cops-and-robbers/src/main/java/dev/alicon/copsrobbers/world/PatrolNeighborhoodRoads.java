package dev.alicon.copsrobbers.world;

import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;

final class PatrolNeighborhoodRoads {
	private PatrolNeighborhoodRoads() {
	}

	static void build(
			ServerLevel level,
			BlockPos anchor,
			BlockPos[] stationOffsets,
			BlockPos[] bankOffsets,
			BlockPos[] hideoutOffsets,
			BlockPos fireStationOffset
	) {
		pathLineX(level, anchor, 0, -108, 116, 1);
		pathLineZ(level, anchor, 0, -56, 66, 1);
		pathLineZ(level, anchor, 58, -38, 44, 1);
		for (BlockPos offset : stationOffsets) {
			connectPath(level, anchor, offset);
		}
		for (BlockPos offset : bankOffsets) {
			connectPath(level, anchor, offset);
		}
		for (BlockPos offset : hideoutOffsets) {
			connectPath(level, anchor, offset);
		}
		connectPath(level, anchor, fireStationOffset);
		for (int x = -96; x <= 108; x += 24) {
			streetLight(level, anchor.offset(x, 0, 4));
		}
		for (int z = -48; z <= 60; z += 24) {
			streetLight(level, anchor.offset(4, 0, z));
		}
		for (int z = -36; z <= 36; z += 24) {
			streetLight(level, anchor.offset(62, 0, z));
		}
	}

	private static void connectPath(ServerLevel level, BlockPos anchor, BlockPos targetOffset) {
		int x = targetOffset.getX();
		int z = targetOffset.getZ();
		pathLineX(level, anchor, z, Math.min(0, x), Math.max(0, x), 1);
		pathLineZ(level, anchor, x, Math.min(0, z), Math.max(0, z), 1);
		pathSquare(level, anchor.offset(x, 0, z), 2);
	}

	private static void pathLineX(ServerLevel level, BlockPos anchor, int z, int minX, int maxX, int radius) {
		for (int x = minX; x <= maxX; x++) {
			pathSquare(level, anchor.offset(x, 0, z), radius);
		}
	}

	private static void pathLineZ(ServerLevel level, BlockPos anchor, int x, int minZ, int maxZ, int radius) {
		for (int z = minZ; z <= maxZ; z++) {
			pathSquare(level, anchor.offset(x, 0, z), radius);
		}
	}

	private static void pathSquare(ServerLevel level, BlockPos rough, int radius) {
		for (int x = -radius; x <= radius; x++) {
			for (int z = -radius; z <= radius; z++) {
				pathBlock(level, rough.offset(x, 0, z));
			}
		}
	}

	private static void pathBlock(ServerLevel level, BlockPos rough) {
		BlockPos pos = PatrolNeighborhoodSite.surface(level, rough).below();
		if (!isPathGround(level.getBlockState(pos))) {
			return;
		}
		PatrolNeighborhoodSite.clearColumn(level, pos, 2);
		level.setBlock(pos, Blocks.GRAVEL.defaultBlockState(), 3);
	}

	private static void streetLight(ServerLevel level, BlockPos rough) {
		BlockPos base = PatrolNeighborhoodSite.surface(level, rough).below();
		if (!isPathGround(level.getBlockState(base))) {
			return;
		}
		for (int y = 1; y <= 4; y++) {
			level.setBlock(base.above(y), Blocks.IRON_BARS.defaultBlockState(), 3);
		}
		level.setBlock(base.above(5), Blocks.GLOWSTONE.defaultBlockState(), 3);
	}

	private static boolean isPathGround(BlockState state) {
		Block block = state.getBlock();
		return block == Blocks.GRASS_BLOCK
				|| block == Blocks.DIRT
				|| block == Blocks.COARSE_DIRT
				|| block == Blocks.PODZOL
				|| block == Blocks.GRAVEL
				|| block == Blocks.SAND
				|| block == Blocks.RED_SAND;
	}
}
