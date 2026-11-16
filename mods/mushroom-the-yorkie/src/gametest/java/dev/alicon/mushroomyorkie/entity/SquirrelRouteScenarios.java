package dev.alicon.mushroomyorkie.entity;

import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.LeavesBlock;
import net.minecraft.world.phys.Vec3;

/** Full native ticks at the live probe's slow starts; no manual AI or post-start positioning. */
final class SquirrelRouteScenarios {
	private SquirrelRouteScenarios() {
	}

	static void observe(GameTestHelper helper, String label, double x, double z) {
		SquirrelEntity squirrel = fixture(helper, x, z);
		boolean scheduled = false;
		try {
			long seed = GameTestSeeds.apply(squirrel, label);
			new SquirrelRouteProbe(helper, squirrel, label, seed).start();
			scheduled = true;
		} finally {
			if (!scheduled) squirrel.discard();
		}
	}

	static void removeClimbedTree(GameTestHelper helper) {
		SquirrelEntity squirrel = fixture(helper, 4.8D, 2.5D);
		GameTestSeeds.apply(squirrel, "tree-removal");
		new SquirrelTreeRemovalProbe(helper, squirrel).start();
	}

	private static SquirrelEntity fixture(GameTestHelper helper, double x, double z) {
		for (int floorX = 1; floorX <= 6; floorX++) {
			for (int floorZ = 1; floorZ <= 6; floorZ++) helper.setBlock(floorX, 0, floorZ, Blocks.STONE);
		}
		for (int y = 1; y <= 5; y++) helper.setBlock(4, y, 4, Blocks.OAK_LOG);
		helper.setBlock(4, 3, 3, Blocks.OAK_LEAVES.defaultBlockState().setValue(LeavesBlock.PERSISTENT, true));
		SquirrelEntity squirrel = helper.spawn(ModEntities.SQUIRREL, 4, 1, 1);
		squirrel.setPos(helper.absoluteVec(new Vec3(x, 1, z)));
		return squirrel;
	}
}
