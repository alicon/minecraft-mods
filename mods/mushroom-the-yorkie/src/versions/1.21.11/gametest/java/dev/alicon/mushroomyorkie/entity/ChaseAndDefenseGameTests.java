package dev.alicon.mushroomyorkie.entity;

import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;

/** Regression cases for returning from a squirrel chase and waking to defend the home. */
public final class ChaseAndDefenseGameTests {
	/** A tree-less squirrel escaping can trigger a full ground return without a teleport. */
	@GameTest(maxTicks = 160, structure = "mushroom_yorkie_gametest:arena_32")
	public void walksBackFromSquirrel(GameTestHelper helper) {
		ChaseAndDefenseScenarios.walksBackFromSquirrel(helper);
	}

	/** A nearby skeleton can wake Mushroom through a wall and be nipped through an open route. */
	@GameTest(maxTicks = 40)
	public void wakesForSkeletonThroughWall(GameTestHelper helper) {
		ChaseAndDefenseScenarios.wakesForSkeletonThroughWall(helper);
	}

	/** A native squirrel climbs onto the crown and hops the air gap to a second tree. */
	@GameTest(maxTicks = 520, structure = "mushroom_yorkie_gametest:arena_32")
	public void squirrelLeapsBetweenNearbyCanopies(GameTestHelper helper) {
		SquirrelTravelScenarios.movesBetweenTrees(helper, false);
	}

	/** When crowns are too far apart a native squirrel descends and climbs the other tree. */
	@GameTest(maxTicks = 680, structure = "mushroom_yorkie_gametest:arena_32")
	public void squirrelWalksBetweenDistantTrees(GameTestHelper helper) {
		SquirrelTravelScenarios.movesBetweenTrees(helper, true);
	}

	/** The squirrel can go beyond its trunk perch and get above a tall overhang. */
	@GameTest(maxTicks = 620, structure = "mushroom_yorkie_gametest:canopy_arena")
	public void squirrelReachesTallCanopy(GameTestHelper helper) {
		SquirrelTravelScenarios.reachesTallCanopy(helper, false);
	}

	/** Losing the tree during an underside crossing releases normal gravity. */
	@GameTest(maxTicks = 620, structure = "mushroom_yorkie_gametest:canopy_arena")
	public void squirrelReleasesRemovedCanopy(GameTestHelper helper) {
		SquirrelTravelScenarios.reachesTallCanopy(helper, true);
	}

	/** A normally generated birch offers a navigable crown. */
	@GameTest(maxTicks = 620, structure = "mushroom_yorkie_gametest:canopy_arena")
	public void squirrelReachesGrownBirch(GameTestHelper helper) {
		SquirrelTravelScenarios.reachesGrownBirch(helper);
	}

	/** One collected oak sapling becomes a vanilla tree after growth. */
	@GameTest(maxTicks = 180, structure = "mushroom_yorkie_gametest:fetch_arena")
	public void squirrelPlantsDroppedSapling(GameTestHelper helper) {
		SquirrelTravelScenarios.plantsDroppedSapling(helper);
	}

	/** Mushroom takes a potty stop while the lead is slack and yields to a walking owner. */
	@GameTest(maxTicks = 30, structure = "mushroom_yorkie_gametest:fetch_arena")
	public void leadPottyStopYieldsToOwner(GameTestHelper helper) {
		ChaseAndDefenseScenarios.leadPottyStopYieldsToOwner(helper);
	}
}
