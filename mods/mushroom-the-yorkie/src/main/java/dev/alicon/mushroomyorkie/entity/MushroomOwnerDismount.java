package dev.alicon.mushroomyorkie.entity;

import net.minecraft.world.phys.Vec3;

/** Drops movement queued at the old seat before an owner-assisted landing starts. */
final class MushroomOwnerDismount {
	private MushroomOwnerDismount() {
	}

	static void clearMovement(MushroomYorkieEntity yorkie) {
		yorkie.getNavigation().stop();
		yorkie.getMoveControl().setWantedPosition(yorkie.getX(), yorkie.getY(), yorkie.getZ(), 0.0D);
		yorkie.setDeltaMovement(Vec3.ZERO);
		yorkie.setXxa(0.0F);
		yorkie.setYya(0.0F);
		yorkie.setZza(0.0F);
	}
}
