package dev.alicon.mushroomyorkie.entity;

import net.minecraft.world.phys.Vec3;
import net.minecraft.world.phys.AABB;

/** Conservative body clearance for a horizontal approach followed by an upward escape. */
final class MushroomClearAscent {
	private MushroomClearAscent() {
	}

	static boolean canReach(MushroomYorkieEntity yorkie, Vec3 candidate, double rise) {
		return canReach(yorkie, yorkie.getBoundingBox(), candidate, rise);
	}

	static boolean canReach(MushroomYorkieEntity yorkie, AABB box, Vec3 candidate, double rise) {
		Vec3 delta = candidate.subtract(yorkie.position());
		return yorkie.level().noCollision(yorkie, box.expandTowards(delta))
				&& yorkie.level().noCollision(yorkie, box.move(delta).expandTowards(0, rise, 0));
	}
}
