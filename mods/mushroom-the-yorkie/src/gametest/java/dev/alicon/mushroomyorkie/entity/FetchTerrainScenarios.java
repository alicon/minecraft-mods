package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.item.ModItems;
import net.minecraft.core.BlockPos;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.DoublePlantBlock;

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

	static void fetchKeepsEachOwnersToy(GameTestHelper helper) {
		var owner = SurvivalGameTestPlayers.createWithoutToyCleanup(helper);
		var guest = SurvivalGameTestPlayers.createWithoutToyCleanup(helper);
		var dog = helper.spawn(ModEntities.MUSHROOM_YORKIE, 2, 1, 2);
		dog.setNoAi(true);
		owner.setPos(dog.getX() - 1, dog.getY(), dog.getZ());
		guest.setPos(dog.getX(), dog.getY(), dog.getZ() + 1);
		dog.claimFor(owner);
		var guestToy = helper.spawnItem(ModItems.YORKIE_CHEW_TOY, 2, 1, 2);
		guestToy.setPos(dog.getX(), dog.getY(), dog.getZ());
		guestToy.setThrower(guest);
		var ownToy = helper.spawnItem(ModItems.YORKIE_BALL, 3, 1, 2);
		ownToy.setPos(dog.getX() + 1, dog.getY(), dog.getZ());
		ownToy.setThrower(owner);
		try {
			var fetch = new FetchBallGoal(dog);
			helper.assertTrue(fetch.canUse(), "Mushroom did not find his owner's ball");
			fetch.start();
			fetch.tick();
			helper.assertTrue(!guestToy.isRemoved() && ownToy.isRemoved()
					&& dog.getMainHandItem().is(ModItems.YORKIE_BALL),
					"Mushroom picked up a guest's toy instead of his owner's ball");
			helper.succeed();
		} finally {
			guestToy.discard();
			ownToy.discard();
			dog.discard();
			helper.getLevel().getServer().getPlayerList().remove(guest);
			helper.getLevel().getServer().getPlayerList().remove(owner);
		}
	}

	static void fetchThroughGrass(GameTestHelper helper, boolean tall) {
		// Other tests in this batch clear their old toy entities while setting up.
		// Stage this asynchronous round trip after that synchronous setup.
		helper.runAfterDelay(20, () -> beginGrassFetch(helper, tall));
	}

	private static void beginGrassFetch(GameTestHelper helper, boolean tall) {
		for (int x = 0; x <= 7; x++) {
			for (int z = 0; z <= 7; z++) {
				helper.setBlock(x, 0, z, Blocks.GRASS_BLOCK);
				if (x >= 3 && tall) {
					DoublePlantBlock.placeAt(helper.getLevel(), Blocks.TALL_GRASS.defaultBlockState(),
							helper.absolutePos(new BlockPos(x, 1, z)), Block.UPDATE_CLIENTS);
				} else if (x >= 3) {
					helper.setBlock(x, 1, z, Blocks.SHORT_GRASS);
				}
			}
		}
		var owner = SurvivalGameTestPlayers.createWithoutToyCleanup(helper);
		var dog = helper.spawn(ModEntities.MUSHROOM_YORKIE, 2, 1, 3);
		var ownerStart = helper.absolutePos(new BlockPos(0, 1, 3)).getBottomCenter();
		owner.setPos(ownerStart.x, ownerStart.y, ownerStart.z);
		dog.claimFor(owner);
		var toy = helper.spawnItem(ModItems.YORKIE_BALL, 6, 1, 3);
		var target = helper.absolutePos(new BlockPos(6, 1, 3)).getBottomCenter();
		toy.setPos(target.x, target.y + 0.2, target.z);
		toy.setThrower(owner);
		toy.setPickUpDelay(20);
		helper.startSequence()
				.thenWaitUntil(() -> helper.assertTrue(toy.isRemoved() && dog.getMainHandItem().is(ModItems.YORKIE_BALL),
						"Mushroom never picked up the ball in grass. dog=" + dog.position()
								+ ", toy=" + toy.position() + ", removed=" + toy.isRemoved()
								+ ", grass=" + helper.getLevel().getBlockState(BlockPos.containing(target))))
				.thenWaitUntil(() -> helper.assertTrue(owner.getInventory().countItem(ModItems.YORKIE_BALL) == 1
						&& dog.getMainHandItem().isEmpty(), "Mushroom did not return one original ball"))
				.thenExecute(() -> {
					dog.discard();
					helper.getLevel().getServer().getPlayerList().remove(owner);
				})
				.thenSucceed();
	}
}
