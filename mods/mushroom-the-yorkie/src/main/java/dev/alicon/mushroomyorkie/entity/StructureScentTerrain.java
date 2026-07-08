package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.MushroomStructureScentConfig;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.tags.FluidTags;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.phys.Vec3;

final class StructureScentTerrain {
	private StructureScentTerrain() {
	}

	static boolean trailBlocked(
			ServerLevel level,
			MushroomYorkieEntity yorkie,
			Player owner,
			StructureScent scent,
			MushroomStructureScentConfig config
	) {
		if (level.getFluidState(yorkie.blockPosition()).is(FluidTags.WATER)
				|| owner.level().getFluidState(owner.blockPosition()).is(FluidTags.WATER)) {
			return true;
		}

		Vec3 lead = StructureScentPolicy.leadPoint(owner.position(), scent.pos(), config.leadAheadBlocks());
		BlockPos groundLead = groundPos(level, yorkie, lead);
		if (Math.abs(groundLead.getY() - yorkie.blockPosition().getY()) > config.maxTrailRiseBlocks()) {
			return true;
		}

		return crossesWater(level, yorkie, yorkie.position(), Vec3.atBottomCenterOf(groundLead));
	}

	static BlockPos groundPos(ServerLevel level, MushroomYorkieEntity yorkie, Vec3 pos) {
		BlockPos column = BlockPos.containing(pos.x, yorkie.getY(), pos.z);
		return level.getHeightmapPos(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, column);
	}

	private static boolean crossesWater(ServerLevel level, MushroomYorkieEntity yorkie, Vec3 start, Vec3 end) {
		Vec3 delta = end.subtract(start);
		int steps = Math.max(2, Math.min(12, (int) (delta.horizontalDistance() / 4.0D)));
		for (int index = 1; index <= steps; index++) {
			Vec3 sample = start.add(delta.scale(index / (double) steps));
			BlockPos ground = groundPos(level, yorkie, sample);
			if (level.getFluidState(ground).is(FluidTags.WATER) || level.getFluidState(ground.below()).is(FluidTags.WATER)) {
				return true;
			}
		}
		return false;
	}
}
