package dev.alicon.mushroomyorkie.entity;

import net.minecraft.core.BlockPos;
import net.minecraft.world.phys.Vec3;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

final class SquirrelTreeClimbPolicyTest {
	@Test
	void treeIsOnlyFoundAfterClimbingToTargetHeight() {
		assertFalse(SquirrelTreeClimbPolicy.reachedHeight(66.79D, 67));
		assertTrue(SquirrelTreeClimbPolicy.reachedHeight(66.8D, 67));
	}

	@Test
	void perchedSquirrelPressesTowardTrunkWithoutRising() {
		Vec3 movement = SquirrelTreeClimbPolicy.clingMovement(
				new Vec3(9.7D, 67.0D, 10.5D),
				new BlockPos(10, 67, 10)
		);

		assertEquals(0.08D, movement.x, 0.001D);
		assertEquals(0.0D, movement.y, 0.001D);
		assertEquals(0.0D, movement.z, 0.001D);
	}

	@Test
	void centeredSquirrelDoesNotDrift() {
		Vec3 movement = SquirrelTreeClimbPolicy.clingMovement(
				new Vec3(10.5D, 67.0D, 10.5D),
				new BlockPos(10, 67, 10)
		);

		assertEquals(Vec3.ZERO, movement);
	}
}
