package dev.alicon.mushroomyorkie.entity;

import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.tags.BlockTags;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.Heightmap;

final class MushroomShelterDetector {
	private static final Direction[] HORIZONTAL_DIRECTIONS = {Direction.NORTH, Direction.SOUTH, Direction.WEST, Direction.EAST};
	private static final int WALL_SCAN_DISTANCE = 5;
	private static final int WALL_SCAN_HEIGHT = 3;

	private MushroomShelterDetector() {
	}

	static boolean isSheltered(ServerLevel level, BlockPos origin) {
		if (level.canSeeSky(origin) || !hasSolidOverhead(level, origin)) {
			return false;
		}

		boolean north = hasBarrier(level, origin, Direction.NORTH);
		boolean south = hasBarrier(level, origin, Direction.SOUTH);
		boolean west = hasBarrier(level, origin, Direction.WEST);
		boolean east = hasBarrier(level, origin, Direction.EAST);
		int sides = sideCount(north, south, west, east);
		return sides >= 3 || ((north && south) || (west && east)) && nearbyWallSamples(level, origin) >= 14;
	}

	private static boolean hasSolidOverhead(ServerLevel level, BlockPos origin) {
		BlockPos top = level.getHeightmapPos(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, origin);
		return top.getY() > origin.getY() + 1;
	}

	private static boolean hasBarrier(ServerLevel level, BlockPos origin, Direction direction) {
		for (int distance = 1; distance <= WALL_SCAN_DISTANCE; distance++) {
			for (int y = 0; y < WALL_SCAN_HEIGHT; y++) {
				if (isShelterBlock(level.getBlockState(origin.relative(direction, distance).above(y)))) {
					return true;
				}
			}
		}
		return false;
	}

	private static int nearbyWallSamples(ServerLevel level, BlockPos origin) {
		int samples = 0;
		for (Direction direction : HORIZONTAL_DIRECTIONS) {
			for (int distance = 1; distance <= WALL_SCAN_DISTANCE; distance++) {
				for (int y = 0; y < WALL_SCAN_HEIGHT; y++) {
					if (isShelterBlock(level.getBlockState(origin.relative(direction, distance).above(y)))) {
						samples++;
					}
				}
			}
		}
		return samples;
	}

	private static int sideCount(boolean north, boolean south, boolean west, boolean east) {
		int count = 0;
		if (north) count++;
		if (south) count++;
		if (west) count++;
		if (east) count++;
		return count;
	}

	private static boolean isShelterBlock(BlockState state) {
		return !state.isAir() && !state.is(BlockTags.LEAVES) && state.blocksMotion();
	}
}
