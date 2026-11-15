package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.item.ModItems;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.world.level.block.Blocks;

/** Water-edge approach points must end inside actual pickup reach, including navigation's arrival tolerance. */
final class FetchTerrainScenarios {
	private FetchTerrainScenarios() {
	}

	static void waterEdgePathAllowsPickup(GameTestHelper helper) {
		for (int x = 0; x <= 10; x++) {
			for (int z = 0; z <= 6; z++) {
				helper.setBlock(x, 1, z, Blocks.STONE);
			}
		}
		helper.setBlock(7, 0, 3, Blocks.STONE);
		helper.setBlock(7, 1, 3, Blocks.WATER);
		MushroomYorkieEntity yorkie = helper.spawn(ModEntities.MUSHROOM_YORKIE, 3, 2, 3);
		yorkie.setNoAi(true);
		yorkie.setOnGround(true);
		var owner = SurvivalGameTestPlayers.create(helper);
		owner.setPos(yorkie.getX() - 2, yorkie.getY(), yorkie.getZ());
		yorkie.claimFor(owner);
		var toy = helper.spawnItem(ModItems.YORKIE_BALL, 7, 1, 3);
		toy.setPos(toy.getX() + 0.5D, toy.getY() + 0.4D, toy.getZ() + 0.5D);
		try {
			FetchBallGoal fetch = new FetchBallGoal(yorkie);
			helper.assertTrue(fetch.canUse(), "Water fixture toy was not found");
			fetch.start();
			fetch.tick();
			var path = yorkie.getNavigation().getPath();
			helper.assertTrue(path != null && path.getNodeCount() > 0, "Water fixture could not plan an approach");
			var end = path.getEntityPosAtNode(yorkie, path.getNodeCount() - 1);
			yorkie.setPos(end);
			fetch.tick();
			helper.assertTrue(toy.isRemoved() && yorkie.getMainHandItem().getCount() == 1,
					"Water-edge path stopped outside pickup reach: endpoint=" + end + ", toy=" + toy.position());
			helper.succeed();
		} finally {
			toy.discard();
			yorkie.discard();
		}
	}
}
