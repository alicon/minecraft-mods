package dev.alicon.mushroomyorkie.entity;

import net.minecraft.world.phys.Vec3;

/** Cancels navigation, queued steering and movement inputs before a new movement intent. */
final class MushroomMovement {
	private MushroomMovement() {
	}

	static void stop(MushroomYorkieEntity yorkie) {
		yorkie.getNavigation().stop();
		yorkie.getMoveControl().setWantedPosition(yorkie.getX(), yorkie.getY(), yorkie.getZ(), 0.0D);
		yorkie.setDeltaMovement(Vec3.ZERO);
		yorkie.setXxa(0.0F);
		yorkie.setYya(0.0F);
		yorkie.setZza(0.0F);
	}
}
