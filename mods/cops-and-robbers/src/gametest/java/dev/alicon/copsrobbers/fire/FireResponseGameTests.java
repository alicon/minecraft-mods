package dev.alicon.copsrobbers.fire;

import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.world.level.block.Blocks;

/** Checks cannon range with open and obstructed paths in a real block world. */
public final class FireResponseGameTests {
	/** Water reaches the exposed tile while a wall shields the tile behind it. */
	@GameTest
	public void cannonStopsAtSolidWall(GameTestHelper helper) {
		BlockPos truck = new BlockPos(3, 2, 1);
		BlockPos exposed = new BlockPos(1, 1, 5);
		BlockPos sheltered = new BlockPos(3, 1, 5);
		for (BlockPos fire : new BlockPos[] {exposed, sheltered}) {
			helper.setBlock(fire.below(), Blocks.NETHERRACK);
			helper.setBlock(fire, Blocks.FIRE);
		}
		helper.setBlock(3, 1, 3, Blocks.BRICKS);
		helper.setBlock(3, 2, 3, Blocks.BRICKS);
		helper.assertTrue(FireResponseHandler.sprayWater(helper.getLevel(), helper.absolutePos(truck), 0, 1, 6, 2),
				"Cannon did not reach exposed fire");
		helper.assertTrue(helper.getLevel().isEmptyBlock(helper.absolutePos(exposed)), "Exposed fire survived");
		helper.assertTrue(helper.getBlockState(sheltered).is(Blocks.FIRE), "Water crossed a solid wall");
		helper.succeed();
	}
}
