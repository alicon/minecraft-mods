package dev.alicon.mushroomyorkie.entity;

import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.tags.FluidTags;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.player.Player;

final class FetchToySafety {
	private static final double MAX_SURVIVAL_FETCH_DROP = 3.0D;
	private static final int WATER_SURFACE_SCAN_BLOCKS = 10;

	private FetchToySafety() {
	}

	static boolean safeFetchPlacement(ServerLevel level, Player owner, MushroomYorkieEntity yorkie, ItemEntity item) {
		return safeSurvivalDrop(owner, yorkie, item) && safeWaterPlacement(level, item);
	}

	static boolean safeSurvivalDrop(Player owner, MushroomYorkieEntity yorkie, ItemEntity item) {
		return owner.isCreative() || yorkie.getY() - item.getY() <= MAX_SURVIVAL_FETCH_DROP;
	}

	private static boolean safeWaterPlacement(ServerLevel level, ItemEntity item) {
		BlockPos pos = item.blockPosition();
		boolean waterHere = level.getFluidState(pos).is(FluidTags.WATER);
		boolean waterBelow = level.getFluidState(pos.below()).is(FluidTags.WATER);
		if (!waterHere && !waterBelow) {
			return true;
		}

		for (int offset = 0; offset <= WATER_SURFACE_SCAN_BLOCKS; offset++) {
			BlockPos breathPos = pos.above(offset);
			if (level.getFluidState(breathPos).is(FluidTags.WATER)) {
				continue;
			}
			return level.isEmptyBlock(breathPos);
		}
		return false;
	}
}
