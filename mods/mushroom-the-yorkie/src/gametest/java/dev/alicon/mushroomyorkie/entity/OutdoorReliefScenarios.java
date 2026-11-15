package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.pet.PetNeeds;
import net.minecraft.core.BlockPos;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.world.level.block.Blocks;

/** A real roof/open doorway distinguishes an unfinished outdoor trip from ordinary owner following. */
final class OutdoorReliefScenarios {
	private OutdoorReliefScenarios() {
	}

	static void outdoorTripWaitsForRelief(GameTestHelper helper) {
		startFixture(helper, false);
	}

	static void outdoorTripSurvivesNeedDecay(GameTestHelper helper) {
		startFixture(helper, true);
	}

	private static void startFixture(GameTestHelper helper, boolean decay) {
		long priorTime = helper.getLevel().getDayTime();
		helper.getLevel().setDayTime(1000);
		for (int x = 0; x <= 12; x++) {
			for (int z = 0; z <= 8; z++) {
				helper.setBlock(x, 1, z, Blocks.STONE);
				if (x <= 4 && z <= 4) {
					helper.setBlock(x, 5, z, Blocks.STONE);
					if (x == 0 || x == 4 || z == 0 || z == 4) {
						for (int y = 2; y <= 4; y++) {
							helper.setBlock(x, y, z, Blocks.STONE);
						}
					}
				}
			}
		}
		helper.setBlock(4, 2, 2, Blocks.AIR);
		helper.setBlock(4, 3, 2, Blocks.AIR);
		MushroomYorkieEntity yorkie = helper.spawn(ModEntities.MUSHROOM_YORKIE, 2, 2, 2);
		yorkie.setNoAi(true);
		yorkie.setOnGround(true);
		var owner = SurvivalGameTestPlayers.create(helper);
		owner.setPos(yorkie.getX() - 1, yorkie.getY(), yorkie.getZ());
		yorkie.claimFor(owner);
		yorkie.needs = new PetNeeds(0, decay ? 81 : 100, 80, 80);
		helper.runAfterDelay(10, () -> assertTrip(helper, yorkie, priorTime, decay));
	}

	private static void assertTrip(GameTestHelper helper, MushroomYorkieEntity yorkie, long priorTime, boolean decay) {
		yorkie.setOnGround(true);
		try {
			helper.assertTrue(!helper.getLevel().canSeeSky(yorkie.blockPosition()), "Fixture pet was not indoors");
			IndoorPottyWarningGoal goal = new IndoorPottyWarningGoal(yorkie);
			helper.assertTrue(goal.canUse(), "Urgent indoor pet did not ask to go outside");
			goal.start();
			goal.tick();
			var path = yorkie.getNavigation().getPath();
			helper.assertTrue(path != null, "Urgent outdoor trip never requested movement");
			var indoorPosition = yorkie.position();
			// Exercise the handoff once a trip reaches open sky; full routing is checked live.
			yorkie.setPos(net.minecraft.world.phys.Vec3.atBottomCenterOf(helper.absolutePos(new BlockPos(6, 2, 2))));
			helper.assertTrue(helper.getLevel().canSeeSky(yorkie.blockPosition()), "Fixture did not reach actual open sky");
			helper.assertTrue(goal.canContinueToUse(), "Outdoor trip stopped at open sky before relief, releasing movement to owner following");
			if (decay) {
				yorkie.needs.tickNeeds(true, false);
				helper.assertTrue(!yorkie.needs.shouldWarnPotty(), "Decay fixture did not cross the warning threshold");
				helper.assertTrue(goal.canContinueToUse(), "Ordinary need decay cancelled a started outdoor trip");
			}
			yorkie.setMushroomOrderedToSit(true);
			helper.assertTrue(!goal.canContinueToUse(), "Outdoor relief trip overrode the owner's sit command");
			yorkie.setMushroomOrderedToSit(false);
			var owner = (net.minecraft.server.level.ServerPlayer) yorkie.getOwner();
			owner.setGameMode(net.minecraft.world.level.GameType.CREATIVE);
			owner.getAbilities().flying = true;
			helper.assertTrue(!goal.canContinueToUse(), "Outdoor trip overrode owner takeoff");
			owner.setGameMode(net.minecraft.world.level.GameType.SURVIVAL);
			var outsidePosition = yorkie.position();
			yorkie.setPos(indoorPosition);
			helper.getLevel().setDayTime(18000);
			helper.assertTrue(!goal.canContinueToUse(), "Outdoor trip overrode sheltered nighttime sleep");
			helper.getLevel().setDayTime(1000);
			yorkie.setPos(outsidePosition);
			for (int tick = 0; tick < MushroomReliefHandler.RELIEF_TICKS; tick++) {
				if (decay && tick == 40) {
					yorkie.needs.tickNeeds(true, false);
					helper.assertTrue(goal.canContinueToUse(), "Need decay interrupted an active relief timer");
				}
				MushroomReliefHandler.tick(yorkie, helper.getLevel());
			}
			helper.assertTrue(yorkie.needs.potty() == 0 && yorkie.relief.lastReliefDay() == 0,
					"Outdoor trip did not complete its daily relief");
			helper.assertTrue(!goal.canContinueToUse(), "Completed relief kept blocking normal owner following");
			helper.succeed();
		} finally {
			yorkie.discard();
			helper.getLevel().setDayTime(priorTime);
		}
	}
}
