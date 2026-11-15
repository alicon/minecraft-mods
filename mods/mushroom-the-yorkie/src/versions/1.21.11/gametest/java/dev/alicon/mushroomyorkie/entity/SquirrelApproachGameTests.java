package dev.alicon.mushroomyorkie.entity;

import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.world.level.block.Blocks;

/** A blocked nearby trunk face must not hide an otherwise usable tree. */
public final class SquirrelApproachGameTests {
	/** Select a clear climbing face when a low branch blocks the nearest standable approach. */
	@GameTest(maxTicks = 240)
	public void squirrelUsesAnotherTreeFace(GameTestHelper helper) {
		for (int x = 1; x <= 6; x++) {
			for (int z = 1; z <= 6; z++) {
				helper.setBlock(x, 0, z, Blocks.STONE);
			}
		}
		for (int y = 1; y <= 5; y++) {
			helper.setBlock(4, y, 4, Blocks.OAK_LOG);
		}
		helper.setBlock(4, 3, 3, Blocks.OAK_LEAVES);
		SquirrelEntity squirrel = helper.spawn(ModEntities.SQUIRREL, 4, 1, 1);
		squirrel.setNoAi(true);
		helper.assertTrue(new SquirrelFindTreeGoal(squirrel).canUse(),
				"Squirrel rejected a tree with clear side faces because the nearest face is blocked");
		double initialY = squirrel.getY();
		squirrel.setNoAi(false);
		helper.succeedWhen(() -> helper.assertTrue(squirrel.hasFoundTree() && squirrel.getY() >= initialY + 3.8D,
				"Squirrel never reached the clear tree face: " + squirrel.position()));
	}
}
