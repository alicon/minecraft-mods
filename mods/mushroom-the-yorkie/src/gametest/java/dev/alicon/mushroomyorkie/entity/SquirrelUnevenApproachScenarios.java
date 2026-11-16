package dev.alicon.mushroomyorkie.entity;

import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.Vec3;

/** Real ground navigation must keep its approach across a one-block rise and drop. */
final class SquirrelUnevenApproachScenarios {
	private SquirrelUnevenApproachScenarios() {
	}

	static void step(GameTestHelper helper, int stepX) {
		for (int x = 0; x <= 15; x++) {
			for (int z = 0; z <= 15; z++) {
				helper.setBlock(x, 0, z, Blocks.STONE);
				if (x >= stepX && x <= 10) helper.setBlock(x, 1, z, Blocks.STONE);
			}
		}
		for (int y = 1; y <= 5; y++) helper.setBlock(12, y, 8, Blocks.OAK_LOG);
		SquirrelEntity squirrel = helper.spawn(ModEntities.SQUIRREL, 2, 1, 8);
		squirrel.setPos(helper.absoluteVec(new Vec3(2.5D, 1.0D, 8.5D)));
		boolean scheduled = false;
		try {
			String label = "one-block-step-" + stepX;
			long seed = GameTestSeeds.apply(squirrel, label);
			new SquirrelRouteProbe(helper, squirrel, label, seed,
					helper.absoluteVec(new Vec3(12.5D, 1.0D, 8.5D))).requireContinuousApproach().start();
			scheduled = true;
		} finally {
			if (!scheduled) squirrel.discard();
		}
	}
}
