package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.pet.PetNeeds;
import dev.alicon.mushroomyorkie.block.ModBlocks;
import net.minecraft.core.BlockPos;
import net.minecraft.world.phys.Vec3;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Blocks;

/** Night routine priority survives recovery; physical rest safety remains independent. */
final class NightRecoveryScenarios {
	private NightRecoveryScenarios() {
	}

	static void recoveryKeepsNightRoutine(GameTestHelper helper, boolean creative) {
		RoomGameTestFixture.build(helper, 8, 4, false);
		MushroomYorkieEntity yorkie = helper.spawn(ModEntities.MUSHROOM_YORKIE, 2, 2, 2);
		yorkie.setNoAi(true);
		var owner = SurvivalGameTestPlayers.create(helper);
		owner.setGameMode(creative ? GameType.CREATIVE : GameType.SURVIVAL);
		owner.setPos(yorkie.getX() - 1, yorkie.getY(), yorkie.getZ());
		yorkie.claimFor(owner);
		helper.runAfterDelay(10, () -> {
			long priorTime = helper.getLevel().getDayTime();
			try {
				var level = helper.getLevel();
				level.setDayTime(18000);
				yorkie.needs = new PetNeeds(0, 100, 80, 80);
				yorkie.setOnGround(true);
				var warning = new IndoorPottyWarningGoal(yorkie);
				helper.assertTrue(MushroomNightBehavior.shouldSleepAtNight(yorkie, level) && !warning.canUse(), "Dry night control did not prioritize sleep");
				yorkie.setOnGround(false);
				helper.assertTrue(!MushroomNightBehavior.shouldSleepAtNight(yorkie, level), "Airborne recovery allowed unsafe sleep");
				helper.assertTrue(!warning.canUse() && !warning.canContinueToUse(), "Nighttime hop started an unwanted outside trip");
				yorkie.setOnGround(true);
				level.setBlockAndUpdate(yorkie.blockPosition(), Blocks.WATER.defaultBlockState());
				helper.assertTrue(MushroomYorkieStateQueries.isWetForSitting(yorkie), "Wet night fixture did not contain water");
				helper.assertTrue(!MushroomNightBehavior.shouldSleepAtNight(yorkie, level), "Wet recovery allowed unsafe sleep");
				helper.assertTrue(!warning.canUse() && !warning.canContinueToUse(), "Nighttime water recovery started an unwanted outside trip");
				level.setDayTime(1000);
				helper.assertTrue(warning.canUse(), "Daytime wet need no longer permits an outside trip");
				level.setBlockAndUpdate(yorkie.blockPosition(), Blocks.AIR.defaultBlockState());
				helper.assertTrue(warning.canUse(), "Dry daytime need no longer permits an outside trip");
				warning.start();
				helper.assertTrue(yorkie.relief.shouldAskToday(MushroomNightBehavior.currentDay(level), false), "Daytime trip did not start");
				level.setDayTime(18000);
				yorkie.setOnGround(false);
				helper.assertTrue(!warning.canContinueToUse(), "Active daytime trip survived sheltered dusk recovery");
				warning.stop();
				helper.assertTrue(!yorkie.relief.shouldAskToday(MushroomNightBehavior.currentDay(level), false), "Cancelled trip retained its active state");
				level.setDayTime(1000);
				yorkie.setOnGround(true);
				yorkie.setMushroomOrderedToSit(true);
				helper.assertTrue(!warning.canUse(), "Explicit sit order no longer blocks the outside trip");
				yorkie.setMushroomOrderedToSit(false);
				if (creative) {
					owner.getAbilities().flying = true;
					helper.assertTrue(!warning.canUse(), "Creative owner flight no longer blocks the outside trip");
					owner.getAbilities().flying = false;
				}
				yorkie.relief.recordRelief(MushroomNightBehavior.currentDay(level));
				helper.assertTrue(!warning.canUse(), "Already completed daily relief was ignored");
				yorkie.relief.setLastReliefDay(MushroomReliefState.neverRelievedDay());
				level.setDayTime(18000);
				yorkie.nightWakeTicks = 100;
				helper.assertTrue(!new SleepAtNightGoal(yorkie).canUse() && !warning.canUse(), "Deliberate wake-up changed its night routine");
				// An unsheltered nighttime pet retains its normal relief behavior.
				yorkie.setPos(Vec3.atBottomCenterOf(helper.absolutePos(new BlockPos(7, 2, 2))));
				yorkie.setOnGround(true);
				helper.assertTrue(!MushroomNightBehavior.shouldSleepAtNight(yorkie, level), "Open-sky control still counted as a sheltered sleep spot");
				helper.assertTrue(MushroomNightBehavior.shouldSeekOutdoorRelief(yorkie, level), "Nighttime open-sky relief was blocked");
				helper.setBlock(7, 2, 2, ModBlocks.DOGHOUSE);
				yorkie.setPos(Vec3.atBottomCenterOf(helper.absolutePos(new BlockPos(6, 2, 2))));
				yorkie.setOnGround(false);
				helper.assertTrue(!MushroomNightBehavior.shouldSeekOutdoorRelief(yorkie, level), "Airborne recovery near an outdoor doghouse requested outside");
				level.setBlockAndUpdate(yorkie.blockPosition(), Blocks.WATER.defaultBlockState());
				helper.assertTrue(MushroomYorkieStateQueries.isWetForSitting(yorkie) && !MushroomNightBehavior.shouldSeekOutdoorRelief(yorkie, level),
						"Wet recovery near an outdoor doghouse requested outside");
				helper.succeed();
			} finally {
				// Adjacent native fixtures are within the 18-block domestic search radius.
				helper.setBlock(7, 2, 2, Blocks.AIR);
				helper.setBlock(6, 2, 2, Blocks.AIR);
				yorkie.discard();
				helper.getLevel().setDayTime(priorTime);
			}
		});
	}
}
