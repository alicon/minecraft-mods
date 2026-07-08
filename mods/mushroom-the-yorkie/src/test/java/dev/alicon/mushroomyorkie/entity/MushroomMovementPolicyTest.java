package dev.alicon.mushroomyorkie.entity;

import static org.junit.jupiter.api.Assertions.assertEquals;

import net.minecraft.world.phys.Vec3;
import org.junit.jupiter.api.Test;

final class MushroomMovementPolicyTest {
	@Test
	void horizontalVectorsAreNormalizedWithoutVerticalDrift() {
		Vec3 direction = MushroomMovementPolicy.normalizedHorizontal(new Vec3(3.0D, 9.0D, 4.0D));

		assertEquals(0.6D, direction.x, 0.001D);
		assertEquals(0.0D, direction.y, 0.001D);
		assertEquals(0.8D, direction.z, 0.001D);
	}

	@Test
	void nearZeroVectorsUseStableFallbackDirection() {
		Vec3 direction = MushroomMovementPolicy.normalizedHorizontal(new Vec3(0.00001D, 4.0D, 0.00001D));

		assertEquals(1.0D, direction.x, 0.001D);
		assertEquals(0.0D, direction.y, 0.001D);
		assertEquals(0.0D, direction.z, 0.001D);
	}
}
