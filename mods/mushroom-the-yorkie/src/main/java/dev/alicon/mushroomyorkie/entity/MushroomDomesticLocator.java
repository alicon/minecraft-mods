package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.block.ModBlocks;
import java.util.function.Predicate;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.block.state.BlockState;

final class MushroomDomesticLocator {
	static final int SEARCH_RADIUS = 18;
	private static final int SEARCH_Y_RADIUS = 4;

	private MushroomDomesticLocator() {
	}

	static BlockPos findNearestFoodBowl(ServerLevel level, BlockPos origin) {
		return findNearest(level, origin, MushroomDomesticLocator::isFoodBowl);
	}

	static BlockPos findNearestWaterBowl(ServerLevel level, BlockPos origin) {
		return findNearest(level, origin, MushroomDomesticLocator::isWaterBowl);
	}

	static BlockPos findNearestDogBed(ServerLevel level, BlockPos origin) {
		return findNearest(level, origin, MushroomDomesticLocator::isSleepSpot);
	}

	static BlockPos findNearestDoghouse(ServerLevel level, BlockPos origin) {
		return findNearest(level, origin, state -> state.is(ModBlocks.DOGHOUSE));
	}

	static boolean isSleepSpot(BlockState state) {
		return state.is(ModBlocks.DOG_BED) || state.is(ModBlocks.DOGHOUSE);
	}

	static boolean hasAnyBowl(ServerLevel level, BlockPos origin) {
		return findNearest(level, origin, MushroomDomesticLocator::isAnyBowl) != null;
	}

	static boolean hasFoodBowl(ServerLevel level, BlockPos origin) {
		return findNearestFoodBowl(level, origin) != null;
	}

	private static BlockPos findNearest(ServerLevel level, BlockPos origin, Predicate<BlockState> predicate) {
		BlockPos min = origin.offset(-SEARCH_RADIUS, -SEARCH_Y_RADIUS, -SEARCH_RADIUS);
		BlockPos max = origin.offset(SEARCH_RADIUS, SEARCH_Y_RADIUS, SEARCH_RADIUS);
		BlockPos nearest = null;
		double nearestDistanceSqr = Double.MAX_VALUE;

		for (BlockPos candidate : BlockPos.betweenClosed(min, max)) {
			if (!level.hasChunk(candidate.getX() >> 4, candidate.getZ() >> 4)) {
				continue;
			}

			BlockState state = level.getBlockState(candidate);
			if (!predicate.test(state)) {
				continue;
			}

			double distanceSqr = distanceSqr(origin, candidate);
			if (distanceSqr < nearestDistanceSqr) {
				nearest = candidate.immutable();
				nearestDistanceSqr = distanceSqr;
			}
		}

		return nearest;
	}

	private static boolean isAnyBowl(BlockState state) {
		return state.is(ModBlocks.DOG_BOWL) || isFoodBowl(state) || isWaterBowl(state);
	}

	private static boolean isFoodBowl(BlockState state) {
		return state.is(ModBlocks.DOG_FOOD_BOWL);
	}

	private static boolean isWaterBowl(BlockState state) {
		return state.is(ModBlocks.DOG_WATER_BOWL);
	}

	private static double distanceSqr(BlockPos first, BlockPos second) {
		double dx = first.getX() - second.getX();
		double dy = first.getY() - second.getY();
		double dz = first.getZ() - second.getZ();
		return dx * dx + dy * dy + dz * dz;
	}
}
