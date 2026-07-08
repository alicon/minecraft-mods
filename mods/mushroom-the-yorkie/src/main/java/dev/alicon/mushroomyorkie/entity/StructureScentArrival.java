package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.MushroomStructureScentConfig;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.player.Player;

final class StructureScentArrival {
	private static final int VILLAGE_ARRIVAL_SCAN_RADIUS = 48;
	private static final int VILLAGE_ARRIVAL_SCAN_STEP = 16;

	private StructureScentArrival() {
	}

	static boolean hasArrived(
			ServerLevel level,
			MushroomYorkieEntity yorkie,
			Player owner,
			StructureScent scent,
			MushroomStructureScentConfig config
	) {
		return StructureScentPolicy.withinDistance(yorkie.position(), scent.pos(), config.foundDistanceBlocks())
				|| StructureScentPolicy.withinDistance(owner.position(), scent.pos(), config.foundDistanceBlocks())
				|| scent.target() == StructureScentTarget.VILLAGE
				&& (nearVillage(level, yorkie.blockPosition()) || nearVillage(level, owner.blockPosition()));
	}

	private static boolean nearVillage(ServerLevel level, BlockPos origin) {
		if (level.isVillage(origin)) {
			return true;
		}

		for (int dx = -VILLAGE_ARRIVAL_SCAN_RADIUS; dx <= VILLAGE_ARRIVAL_SCAN_RADIUS; dx += VILLAGE_ARRIVAL_SCAN_STEP) {
			for (int dz = -VILLAGE_ARRIVAL_SCAN_RADIUS; dz <= VILLAGE_ARRIVAL_SCAN_RADIUS; dz += VILLAGE_ARRIVAL_SCAN_STEP) {
				for (int dy = -VILLAGE_ARRIVAL_SCAN_STEP; dy <= VILLAGE_ARRIVAL_SCAN_STEP; dy += VILLAGE_ARRIVAL_SCAN_STEP) {
					BlockPos pos = origin.offset(dx, dy, dz);
					if (level.hasChunk(pos.getX() >> 4, pos.getZ() >> 4) && level.isVillage(pos)) {
						return true;
					}
				}
			}
		}
		return false;
	}
}
