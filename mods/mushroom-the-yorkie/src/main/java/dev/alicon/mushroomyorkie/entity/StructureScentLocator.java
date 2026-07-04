package dev.alicon.mushroomyorkie.entity;

import com.mojang.datafixers.util.Pair;
import dev.alicon.mushroomyorkie.MushroomStructureScentConfig;
import java.util.Optional;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.core.HolderGetter;
import net.minecraft.core.HolderSet;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.levelgen.structure.Structure;

final class StructureScentLocator {
	private StructureScentLocator() {
	}

	static Optional<StructureScent> findNearest(ServerLevel level, BlockPos origin, MushroomStructureScentConfig config) {
		int searchChunkRadius = Math.max(1, config.maxDistanceBlocks() / 16);
		double minDistanceSqr = square(config.minDistanceBlocks());
		double maxDistanceSqr = square(config.maxDistanceBlocks());
		StructureScent nearest = null;
		double nearestDistanceSqr = Double.MAX_VALUE;

		for (StructureScentTarget target : StructureScentTarget.fromConfig(config.targets())) {
			BlockPos pos = findTarget(level, origin, searchChunkRadius, target);
			if (pos == null) {
				continue;
			}

			double distanceSqr = distanceSqr(origin, pos);
			if (distanceSqr >= minDistanceSqr && distanceSqr <= maxDistanceSqr && distanceSqr < nearestDistanceSqr) {
				nearest = new StructureScent(target, pos.immutable());
				nearestDistanceSqr = distanceSqr;
			}
		}

		return Optional.ofNullable(nearest);
	}

	private static BlockPos findTarget(ServerLevel level, BlockPos origin, int searchChunkRadius, StructureScentTarget target) {
		if (target.tag() != null) {
			return level.findNearestMapStructure(target.tag(), origin, searchChunkRadius, false);
		}

		return findStructureKey(level, origin, searchChunkRadius, target.structureKey());
	}

	private static BlockPos findStructureKey(ServerLevel level, BlockPos origin, int searchChunkRadius, ResourceKey<Structure> key) {
		Optional<? extends HolderGetter<Structure>> lookup = level.registryAccess().lookup(Registries.STRUCTURE);
		Optional<Holder.Reference<Structure>> holder = lookup.flatMap(getter -> getter.get(key));
		if (holder.isEmpty()) {
			return null;
		}

		Pair<BlockPos, Holder<Structure>> result = level.getChunkSource().getGenerator()
				.findNearestMapStructure(level, HolderSet.direct(holder.get()), origin, searchChunkRadius, false);
		return result == null ? null : result.getFirst();
	}

	private static double distanceSqr(BlockPos first, BlockPos second) {
		double dx = first.getX() - second.getX();
		double dy = first.getY() - second.getY();
		double dz = first.getZ() - second.getZ();
		return dx * dx + dy * dy + dz * dz;
	}

	private static double square(int value) {
		return (double) value * value;
	}
}
