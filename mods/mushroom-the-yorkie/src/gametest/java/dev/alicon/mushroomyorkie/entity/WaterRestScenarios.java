package dev.alicon.mushroomyorkie.entity;

import net.minecraft.gametest.framework.GameTestHelper;
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
}
