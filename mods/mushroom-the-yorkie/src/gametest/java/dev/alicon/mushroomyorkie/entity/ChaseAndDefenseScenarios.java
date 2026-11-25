package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.pet.PetNeeds;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.Vec3;

final class ChaseAndDefenseScenarios {
	private ChaseAndDefenseScenarios() {
	}

	static void walksBackFromSquirrel(GameTestHelper helper) {
		for (int x = 0; x <= 30; x++) {
			for (int z = 0; z <= 4; z++) {
				helper.setBlock(x, 0, z, Blocks.STONE);
			}
		}
		var owner = SurvivalGameTestPlayers.createWithoutToyCleanup(helper);
		owner.setPos(helper.absoluteVec(new Vec3(2.5D, 1.0D, 2.5D)));
		var yorkie = helper.spawn(ModEntities.MUSHROOM_YORKIE, 19, 1, 2);
		yorkie.claimFor(owner);
		var squirrel = helper.spawnWithNoFreeWill(ModEntities.SQUIRREL, 23, 1, 2);
		var squirrelStart = squirrel.blockPosition();
		Vec3[] previous = {yorkie.position()};

		helper.startSequence()
				.thenWaitUntil(() -> helper.assertTrue(squirrelStart.equals(yorkie.getNavigation().getTargetPos())
						&& !yorkie.getNavigation().isDone(), "Fixture never began the native squirrel chase"))
				.thenExecute(() -> {
					helper.assertTrue(yorkie.distanceToSqr(owner) > 144.0D, "Recall fixture is below Minecraft's follow teleport range");
					squirrel.setPos(helper.absoluteVec(new Vec3(29.5D, 1.0D, 2.5D)));
					helper.assertTrue(!squirrel.hasFoundTree() && squirrel.distanceToSqr(owner) > 576.0D, "Fixture did not trip squirrel recall");
					previous[0] = yorkie.position();
				})
				.thenExecuteFor(110, () -> {
					helper.assertTrue(yorkie.position().distanceTo(previous[0]) < 0.8D,
							"Mushroom jumped more than a normal walking step while returning from the chase");
					previous[0] = yorkie.position();
				})
				.thenExecute(() -> {
					helper.assertTrue(yorkie.distanceToSqr(owner) <= 9.0D && yorkie.peacefulMobMemory.remembers(squirrel),
							"Mushroom did not finish the return or remembered squirrel chase restarted");
					squirrel.discard();
					yorkie.discard();
					owner.discard();
				})
				.thenSucceed();
	}

	static void wakesForSkeletonThroughWall(GameTestHelper helper) {
		RoomGameTestFixture.build(helper, 8, 4, false);
		var owner = SurvivalGameTestPlayers.createWithoutToyCleanup(helper);
		// The threat is within Mushroom's hearing range, outside the owner's search radius.
		owner.setPos(helper.absoluteVec(new Vec3(-8.5D, 2.0D, 2.5D)));
		var yorkie = helper.spawn(ModEntities.MUSHROOM_YORKIE, 3, 2, 2);
		yorkie.setPos(helper.absoluteVec(new Vec3(3.71D, 2.0D, 2.5D)));
		yorkie.claimFor(owner);
		yorkie.setNoAi(true);

		helper.runAfterDelay(10, () -> {
			var level = helper.getLevel();
			long priorTime = level.getDayTime();
			var skeleton = helper.spawnWithNoFreeWill(EntityType.SKELETON, 5, 2, 2);
			skeleton.setPos(helper.absoluteVec(new Vec3(5.05D, 2.0D, 2.5D)));
			try {
				level.setDayTime(18000);
				yorkie.setOnGround(true);
				helper.assertTrue(MushroomNightBehavior.shouldSleepAtNight(yorkie, level), "No sheltered night sleep in defense fixture");
				yorkie.setSleeping(true);
				float initialHealth = skeleton.getHealth();
				helper.assertTrue(yorkie.isMushroomSleeping() && !yorkie.hasLineOfSight(skeleton)
						&& yorkie.distanceToSqr(skeleton) < 2.2D, "Skeleton fixture did not begin asleep, close, and behind a wall");
				yorkie.setNoAi(false);
				for (int tick = 0; tick < 10; tick++) {
				level.tickNonPassenger(yorkie);
				}
				helper.assertTrue(!yorkie.isMushroomSleeping() && !yorkie.isInSittingPose(), "Skeleton outside the wall did not wake Mushroom");
				helper.assertTrue(skeleton.getHealth() == initialHealth, "Mushroom bit through the closed wall");
			helper.setBlock(4, 2, 2, Blocks.AIR);
			helper.setBlock(4, 3, 2, Blocks.AIR);
			for (int tick = 0; tick < 60 && skeleton.getHealth() == initialHealth; tick++) {
				level.tickNonPassenger(yorkie);
				}
			helper.assertTrue(skeleton.getHealth() < initialHealth, "Awake Mushroom did not nip the now-reachable skeleton: dog=" + yorkie.position()
					+ ", skeleton=" + skeleton.position() + ", sight=" + yorkie.hasLineOfSight(skeleton) + ", sleeping=" + yorkie.isMushroomSleeping());
				helper.succeed();
			} finally {
				level.setDayTime(priorTime);
				yorkie.discard();
				skeleton.discard();
				owner.discard();
			}
		});
	}

	static void leadPottyStopYieldsToOwner(GameTestHelper helper) {
		for (int x = 1; x <= 8; x++) {
			for (int z = 1; z <= 5; z++) helper.setBlock(x, 0, z, Blocks.GRASS_BLOCK);
		}
		var owner = SurvivalGameTestPlayers.createWithoutToyCleanup(helper);
		owner.setPos(helper.absoluteVec(new Vec3(3.5D, 1.0D, 3.5D)));
		var yorkie = helper.spawn(ModEntities.MUSHROOM_YORKIE, 2, 1, 3);
		yorkie.claimFor(owner);
		yorkie.setNoAi(true);
		yorkie.setOnGround(true);
		yorkie.needs = new PetNeeds(0, 100, 80, 80);
		yorkie.setHarness(true);
		yorkie.setLeashedTo(owner, true);
		var walk = new MushroomLeadWalkGoal(yorkie);
		try {
			helper.assertTrue(yorkie.needs.shouldWarnPotty() && walk.canUse(), "Pet with an owner-held leash did not take an outdoor potty stop");
			walk.start();
			helper.assertTrue(walk.canContinueToUse(), "Outdoor stop did not start under a slack lead");
			owner.setPos(helper.absoluteVec(new Vec3(7.5D, 1.0D, 3.5D)));
			helper.assertTrue(!walk.canContinueToUse(), "Mushroom's pause did not yield when the owner kept walking");
			helper.succeed();
		} finally {
			walk.stop();
			yorkie.discard();
			owner.discard();
		}
	}
}
