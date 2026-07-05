package dev.alicon.mushroomyorkie.entity;

import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.pathfinder.Path;

final class MushroomOutdoorLocator {
	private static final int MAX_RADIUS = 36;
	private static final int RADIUS_STEP = 4;
	private static final int Y_SCAN = 8;

	private MushroomOutdoorLocator() {
	}

	static BlockPos findReachableOutdoor(MushroomYorkieEntity yorkie, ServerLevel level, BlockPos origin) {
		for (int radius = RADIUS_STEP; radius <= MAX_RADIUS; radius += RADIUS_STEP) {
			int samples = Math.max(12, radius * 2);
			for (int index = 0; index < samples; index++) {
				double angle = index * Math.PI * 2.0D / samples;
				int x = origin.getX() + (int) Math.round(Math.cos(angle) * radius);
				int z = origin.getZ() + (int) Math.round(Math.sin(angle) * radius);
				BlockPos candidate = outdoorCandidate(level, x, origin.getY(), z);
				if (candidate != null && canReach(yorkie, candidate)) {
					return candidate;
				}
			}
		}
		return null;
	}

	private static BlockPos outdoorCandidate(ServerLevel level, int x, int originY, int z) {
		BlockPos heightmap = level.getHeightmapPos(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, new BlockPos(x, originY, z));
		if (isStandableOutside(level, heightmap)) {
			return heightmap.immutable();
		}

		for (int offset = Y_SCAN; offset >= -Y_SCAN; offset--) {
			BlockPos pos = new BlockPos(x, originY + offset, z);
			if (isStandableOutside(level, pos)) {
				return pos;
			}
		}
		return null;
	}

	private static boolean isStandableOutside(ServerLevel level, BlockPos pos) {
		return level.canSeeSky(pos)
				&& level.isEmptyBlock(pos)
				&& level.isEmptyBlock(pos.above())
				&& !level.getBlockState(pos.below()).isAir();
	}

	private static boolean canReach(MushroomYorkieEntity yorkie, BlockPos pos) {
		Path path = yorkie.getNavigation().createPath(pos, 1);
		return path != null && path.canReach();
	}
}
