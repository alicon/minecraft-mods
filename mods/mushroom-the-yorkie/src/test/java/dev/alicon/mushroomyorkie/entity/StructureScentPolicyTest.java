package dev.alicon.mushroomyorkie.entity;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import net.minecraft.core.BlockPos;
import net.minecraft.world.phys.Vec3;
import org.junit.jupiter.api.Test;

final class StructureScentPolicyTest {
	@Test
	void leadPointRunsAheadOfOwnerTowardTarget() {
		Vec3 lead = StructureScentPolicy.leadPoint(new Vec3(0.5D, 64.0D, 0.5D), new BlockPos(100, 64, 0), 18);

		assertEquals(18.5D, lead.x, 0.001D);
		assertEquals(64.0D, lead.y, 0.001D);
		assertEquals(0.5D, lead.z, 0.001D);
	}

	@Test
	void leadPointFallsBackToStableDirectionWhenOwnerIsAtTarget() {
		Vec3 lead = StructureScentPolicy.leadPoint(new Vec3(5.5D, 64.0D, 5.5D), new BlockPos(5, 64, 5), 18);

		assertEquals(23.5D, lead.x, 0.001D);
		assertEquals(64.0D, lead.y, 0.001D);
		assertEquals(5.5D, lead.z, 0.001D);
	}

	@Test
	void foundDistanceUsesBlockRadiusAroundTarget() {
		BlockPos target = new BlockPos(100, 64, 100);

		assertTrue(StructureScentPolicy.withinDistance(new Vec3(110.0D, 64.0D, 100.0D), target, 16));
		assertFalse(StructureScentPolicy.withinDistance(new Vec3(130.0D, 64.0D, 100.0D), target, 16));
	}

	@Test
	void waitsForOwnerWhenMushroomGetsTooFarAhead() {
		assertTrue(StructureScentPolicy.shouldWaitForOwner(30.0D * 30.0D, 18));
		assertFalse(StructureScentPolicy.shouldWaitForOwner(12.0D * 12.0D, 18));
	}
}
