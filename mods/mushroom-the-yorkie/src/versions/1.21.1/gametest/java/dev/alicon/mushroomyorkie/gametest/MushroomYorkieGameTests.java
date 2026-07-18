package dev.alicon.mushroomyorkie.gametest;

import dev.alicon.mushroomyorkie.entity.ModEntities;
import dev.alicon.mushroomyorkie.entity.SquirrelEntity;
import net.minecraft.gametest.framework.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.world.level.block.Blocks;

/** Headless Minecraft GameTest functions for Mushroom behavior that needs a world. */
public final class MushroomYorkieGameTests {
	/** Verifies the custom Yorkie entity can spawn in a headless Minecraft test world. */
	@GameTest(template = "fabric-gametest-api-v1:empty")
	public void mushroomYorkieSpawns(GameTestHelper helper) {
		helper.spawn(ModEntities.MUSHROOM_YORKIE, 2, 2, 2);
		helper.assertEntityPresent(ModEntities.MUSHROOM_YORKIE);
		helper.succeed();
	}

	/** Verifies a squirrel approaches a trunk and climbs to its selected safe height. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 200)
	public void squirrelClimbsTree(GameTestHelper helper) {
		for (int x = 1; x <= 6; x++) {
			for (int z = 1; z <= 6; z++) {
				helper.setBlock(x, 0, z, Blocks.STONE);
			}
		}
		for (int y = 1; y <= 5; y++) {
			helper.setBlock(4, y, 4, Blocks.OAK_LOG);
		}

		SquirrelEntity squirrel = helper.spawn(ModEntities.SQUIRREL, 1, 1, 4);
		double startingY = squirrel.getY();
		helper.succeedWhen(() -> helper.assertTrue(
				squirrel.hasFoundTree() && squirrel.getY() >= startingY + 3.8D,
				"Squirrel did not climb the test trunk: position=" + squirrel.position()
						+ ", movement=" + squirrel.getDeltaMovement()
						+ ", foundTree=" + squirrel.hasFoundTree()
						+ ", noGravity=" + squirrel.isNoGravity()
						+ ", horizontalCollision=" + squirrel.horizontalCollision
						+ ", navigationDone=" + squirrel.getNavigation().isDone()
		));
	}
}
