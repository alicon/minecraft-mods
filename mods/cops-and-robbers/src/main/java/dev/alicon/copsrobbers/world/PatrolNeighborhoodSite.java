package dev.alicon.copsrobbers.world;

import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.levelgen.Heightmap;

final class PatrolNeighborhoodSite {
	private PatrolNeighborhoodSite() {
	}

	static BlockPos clearPad(ServerLevel level, BlockPos roughCenter, int halfX, int halfZ) {
		BlockPos center = surface(level, roughCenter);
		int y = center.getY();
		for (int x = -halfX; x <= halfX; x++) {
			for (int z = -halfZ; z <= halfZ; z++) {
				BlockPos pos = new BlockPos(center.getX() + x, y, center.getZ() + z);
				clearColumn(level, pos, 12);
				level.setBlock(pos, Blocks.GRASS_BLOCK.defaultBlockState(), 3);
				level.setBlock(pos.below(), Blocks.DIRT.defaultBlockState(), 3);
			}
		}
		return center;
	}

	static void clearColumn(ServerLevel level, BlockPos ground, int height) {
		for (int y = 1; y <= height; y++) {
			level.setBlock(ground.above(y), Blocks.AIR.defaultBlockState(), 3);
		}
	}

	static BlockPos surface(ServerLevel level, BlockPos pos) {
		return level.getHeightmapPos(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, pos);
	}
}
