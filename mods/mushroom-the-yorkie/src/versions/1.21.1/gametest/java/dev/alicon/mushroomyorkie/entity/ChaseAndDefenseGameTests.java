package dev.alicon.mushroomyorkie.entity;

import net.minecraft.gametest.framework.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;

/** Regression cases for returning from a squirrel chase and waking to defend the home. */
public final class ChaseAndDefenseGameTests {
	/** A tree-less squirrel escaping can trigger a full ground return without a teleport. */
	@GameTest(template = "mushroom_yorkie_gametest:arena_32", timeoutTicks = 160)
	public void walksBackFromSquirrel(GameTestHelper helper) {
		ChaseAndDefenseScenarios.walksBackFromSquirrel(helper);
	}

	/** A nearby skeleton can wake Mushroom through a wall and be nipped through an open route. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 40)
	public void wakesForSkeletonThroughWall(GameTestHelper helper) {
		ChaseAndDefenseScenarios.wakesForSkeletonThroughWall(helper);
	}

	/** A native squirrel climbs onto the crown and hops the air gap to a second tree. */
	@GameTest(template = "mushroom_yorkie_gametest:arena_32", timeoutTicks = 520)
	public void squirrelLeapsBetweenNearbyCanopies(GameTestHelper helper) {
		SquirrelTravelScenarios.movesBetweenTrees(helper, false);
	}

	/** When crowns are too far apart a native squirrel descends and climbs the other tree. */
	@GameTest(template = "mushroom_yorkie_gametest:arena_32", timeoutTicks = 680)
	public void squirrelWalksBetweenDistantTrees(GameTestHelper helper) {
		SquirrelTravelScenarios.movesBetweenTrees(helper, true);
	}

	/** One collected oak sapling becomes a vanilla tree after growth. */
	@GameTest(template = "mushroom_yorkie_gametest:fetch_arena", timeoutTicks = 180)
	public void squirrelPlantsDroppedSapling(GameTestHelper helper) {
		SquirrelTravelScenarios.plantsDroppedSapling(helper);
	}

	/** Mushroom takes a potty stop while the lead is slack and yields to a walking owner. */
	@GameTest(template = "mushroom_yorkie_gametest:fetch_arena", timeoutTicks = 30)
	public void leadPottyStopYieldsToOwner(GameTestHelper helper) {
		ChaseAndDefenseScenarios.leadPottyStopYieldsToOwner(helper);
	}
}
