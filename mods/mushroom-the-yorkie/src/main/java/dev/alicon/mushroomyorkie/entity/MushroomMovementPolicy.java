package dev.alicon.mushroomyorkie.entity;

import net.minecraft.world.phys.Vec3;

final class MushroomMovementPolicy {
	private MushroomMovementPolicy() {
	}

	static Vec3 normalizedHorizontal(Vec3 vector) {
		Vec3 horizontal = new Vec3(vector.x, 0.0D, vector.z);
		if (horizontal.lengthSqr() < 1.0E-4D) {
			return new Vec3(1.0D, 0.0D, 0.0D);
		}

		return horizontal.normalize();
	}
}
