package dev.alicon.mushroomyorkie.entity;

import net.minecraft.core.BlockPos;
import net.minecraft.world.phys.Vec3;

/** Night sleep and creative naps share the same low-bed position and precise native approach. */
final class MushroomSleepSpotTargets {
	private static final double BED_TOP_Y_OFFSET = 0.25D;

	private MushroomSleepSpotTargets() {
	}

	static Vec3 center(BlockPos spot) {
		return Vec3.atBottomCenterOf(spot).add(0.0D, BED_TOP_Y_OFFSET, 0.0D);
	}

	static void moveTo(MushroomYorkieEntity yorkie, BlockPos spot, double speed) {
		// Vanilla's one-block target accuracy can report success beside a low bed, beyond sleep's arrival radius.
		var path = yorkie.getNavigation().createPath(BlockPos.containing(center(spot)), 0);
		yorkie.getNavigation().moveTo(path, speed);
	}
}
