package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.block.ModBlocks;
import net.minecraft.core.BlockPos;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;

/** Native rest-state guards must protect both ordinary night sleep and callers requesting a nap. */
final class WaterRestScenarios {
	private WaterRestScenarios() {
	}

	static void waterClearsSleepAndRejectsRest(GameTestHelper helper) {
		long priorTime = helper.getLevel().getDayTime();
		RoomGameTestFixture.build(helper, 4, 4, false);
		MushroomYorkieEntity yorkie = helper.spawn(ModEntities.MUSHROOM_YORKIE, 2, 2, 2);
		yorkie.setNoAi(true);
		var owner = SurvivalGameTestPlayers.create(helper);
		owner.setPos(yorkie.getX() - 1, yorkie.getY(), yorkie.getZ());
		yorkie.claimFor(owner);
		helper.runAfterDelay(10, () -> {
			try {
				helper.getLevel().setDayTime(18000);
				// NoAI fixture motion does not establish landing; the stone floor is directly below.
				yorkie.setOnGround(true);
				helper.assertTrue(MushroomNightBehavior.shouldSleepAtNight(yorkie, helper.getLevel()), "Dry sheltered night fixture could not sleep");
				yorkie.setSleeping(true);
				helper.assertTrue(yorkie.isMushroomSleeping() && yorkie.isInSittingPose(), "Dry sleep control failed");
				yorkie.setSleeping(false);
				yorkie.setOnGround(false);
				helper.assertTrue(!MushroomNightBehavior.shouldSleepAtNight(yorkie, helper.getLevel()), "An airborne pet could start night sleep before landing");
				yorkie.setSleeping(true);
				helper.assertTrue(!yorkie.isMushroomSleeping(), "A nap caller could sleep during a jump");
				yorkie.setOnGround(true);
				yorkie.setSleeping(true);
				var feet = yorkie.blockPosition();
				var originalPosition = yorkie.position();
				var below = feet.below();
				helper.getLevel().setBlockAndUpdate(below, Blocks.WATER.defaultBlockState());
				yorkie.setPos(feet.getX() + 0.1D, feet.getY(), feet.getZ() + 0.5D);
				yorkie.setOnGround(true);
				yorkie.setSleeping(false);
				helper.assertTrue(!MushroomYorkieStateQueries.isWetForSitting(yorkie), "Edge fixture should have dry feet above water");
				helper.assertTrue(!MushroomNightBehavior.shouldSleepAtNight(yorkie, helper.getLevel()), "An edge-supported pet could sleep with his center over water");
				yorkie.setSleeping(true);
				helper.assertTrue(!yorkie.isMushroomSleeping(), "A nap caller could sleep over an unsupported water edge");
				assertSupportedSleep(helper, yorkie, below, ModBlocks.DOG_BED, 0.25D);
				assertSupportedSleep(helper, yorkie, below, Blocks.OAK_SLAB, 0.5D);
				helper.getLevel().setBlockAndUpdate(below.below(), Blocks.STONE.defaultBlockState());
				assertSupportedSleep(helper, yorkie, below, ModBlocks.DOGHOUSE, 0.25D);
				yorkie.setOnGround(false);
				yorkie.setSleeping(true);
				helper.assertTrue(yorkie.isMushroomSleeping(), "Doghouse visual bed anchor was not accepted over its solid floor");
				helper.getLevel().setBlockAndUpdate(below.below(), Blocks.WATER.defaultBlockState());
				yorkie.setSleeping(true);
				helper.assertTrue(!yorkie.isMushroomSleeping(), "Unsupported doghouse over water allowed sleep");
				helper.getLevel().setBlockAndUpdate(below.below(), Blocks.STONE.defaultBlockState());
				helper.getLevel().setBlockAndUpdate(below, Blocks.STONE.defaultBlockState());
				yorkie.setPos(originalPosition);
				yorkie.setOnGround(true);
				yorkie.setSleeping(true);
				helper.assertTrue(yorkie.isMushroomSleeping(), "Water-entry control did not restore dry sleep");
				helper.getLevel().setBlockAndUpdate(feet, Blocks.WATER.defaultBlockState());
				helper.assertTrue(MushroomYorkieStateQueries.isWetForSitting(yorkie), "Water fixture did not wet the pet");
				MushroomSittingPose.preventWaterRest(yorkie);
				helper.assertTrue(!yorkie.isMushroomSleeping() && !yorkie.isInSittingPose(), "Entering water retained sleep/rest pose without a sit order");
				helper.assertTrue(!MushroomNightBehavior.shouldSleepAtNight(yorkie, helper.getLevel()) && !new SleepAtNightGoal(yorkie).canUse(),
						"Sheltered water still allowed the night sleep goal");
				yorkie.setSleeping(true);
				helper.assertTrue(!yorkie.isMushroomSleeping(), "A nap caller could reapply sleep while wet");
				yorkie.setMushroomOrderedToSit(true);
				helper.assertTrue(!yorkie.isOrderedToSit() && !yorkie.isInSittingPose(), "Wet sit request was accepted");
				helper.getLevel().setBlockAndUpdate(feet, Blocks.AIR.defaultBlockState());
				helper.assertTrue(MushroomNightBehavior.shouldSleepAtNight(yorkie, helper.getLevel()), "Dry nighttime sleep did not become eligible again");
				yorkie.setSleeping(true);
				helper.assertTrue(yorkie.isMushroomSleeping() && yorkie.isInSittingPose(), "Dry sleep could not resume after leaving water");
				helper.succeed();
			} finally {
				yorkie.discard();
				helper.getLevel().setDayTime(priorTime);
			}
		});
	}

	private static void assertSupportedSleep(GameTestHelper helper, MushroomYorkieEntity yorkie, BlockPos below, Block block, double height) {
		helper.getLevel().setBlockAndUpdate(below, block.defaultBlockState());
		yorkie.setPos(below.getX() + 0.5D, below.getY() + height, below.getZ() + 0.5D);
		yorkie.setOnGround(true);
		yorkie.setSleeping(true);
		helper.assertTrue(yorkie.isMushroomSleeping(), "Dry thin support could not sleep: " + block);
	}
}
