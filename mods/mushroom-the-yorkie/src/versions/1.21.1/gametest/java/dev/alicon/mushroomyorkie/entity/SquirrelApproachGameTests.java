package dev.alicon.mushroomyorkie.entity;

import net.minecraft.gametest.framework.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.world.level.block.Blocks;

/** A blocked nearby trunk face must not hide an otherwise usable tree. */
public final class SquirrelApproachGameTests {
	/** Observe the centered north start that previously circled before climbing. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 340)
	public void squirrelCenteredNorthRoute(GameTestHelper helper) {
		SquirrelRouteScenarios.observe(helper, "centered-north", 4.5D, 1.5D);
	}

	/** Observe the offset north start without replacing its native navigation. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 340)
	public void squirrelOffsetNorthRoute(GameTestHelper helper) {
		SquirrelRouteScenarios.observe(helper, "offset-north", 4.8D, 1.5D);
	}

	/** Observe the nearer blocked-branch start from the live trace. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 340)
	public void squirrelNearBranchRoute(GameTestHelper helper) {
		SquirrelRouteScenarios.observe(helper, "near-branch", 4.8D, 2.5D);
	}

	/** Keep the previously faster start as a neighboring route control. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 340)
	public void squirrelWestNorthRoute(GameTestHelper helper) {
		SquirrelRouteScenarios.observe(helper, "west-north", 3.8D, 1.5D);
	}

	/** Keep native approach and climb stable from the south side. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 340)
	public void squirrelSouthRoute(GameTestHelper helper) {
		SquirrelRouteScenarios.observe(helper, "south", 4.8D, 6.2D);
	}

	/** Keep native approach and climb stable from the east side. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 340)
	public void squirrelEastRoute(GameTestHelper helper) {
		SquirrelRouteScenarios.observe(helper, "east", 6.2D, 4.8D);
	}

	/** Keep native approach and climb stable from the west side. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 340)
	public void squirrelWestRoute(GameTestHelper helper) {
		SquirrelRouteScenarios.observe(helper, "west", 2.2D, 4.8D);
	}

	/** Keep native approach and climb stable from the near-west side. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 340)
	public void squirrelNearWestRoute(GameTestHelper helper) {
		SquirrelRouteScenarios.observe(helper, "near-west", 3.2D, 4.2D);
	}

	/** Removing the climbed trunk must restore gravity and allow a native landing. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 340)
	public void squirrelReleasesRemovedTree(GameTestHelper helper) {
		SquirrelRouteScenarios.removeClimbedTree(helper);
	}

	/** A blocked nearby tree must not hide a farther reachable tree. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 340)
	public void squirrelChoosesReachableAlternative(GameTestHelper helper) {
		SquirrelReachabilityScenarios.alternativeTree(helper, true);
	}

	/** With the barrier removed, keep the nearer tree as the control. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 340)
	public void squirrelKeepsOpenNearestTree(GameTestHelper helper) {
		SquirrelReachabilityScenarios.alternativeTree(helper, false);
	}

	/** Prove the alternative tree itself is reachable with native movement. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 340)
	public void squirrelReachesFartherTreeAlone(GameTestHelper helper) {
		SquirrelReachabilityScenarios.fartherTreeOnly(helper);
	}

	/** Reach another face of the same tree when the nearest face is enclosed. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 340)
	public void squirrelSkipsBlockedFace(GameTestHelper helper) {
		SquirrelReachabilityScenarios.blockedFaceOnly(helper);
	}

	/** Without a reachable tree, normal avoidance must still move away from Mushroom. */
	@GameTest(template = "mushroom_yorkie_gametest:fetch_arena", timeoutTicks = 160)
	public void squirrelFleesWithoutTree(GameTestHelper helper) {
		SquirrelOtherGoalScenarios.flee(helper);
	}

	/** Without a tree, a squirrel can still walk to a player holding berries. */
	@GameTest(template = "mushroom_yorkie_gametest:fetch_arena", timeoutTicks = 160)
	public void squirrelAcceptsTemptingWithoutTree(GameTestHelper helper) {
		SquirrelOtherGoalScenarios.tempt(helper);
	}

	/** A wall built ahead during approach must trigger a reachable alternative. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 340)
	public void squirrelReplansClosedApproach(GameTestHelper helper) {
		SquirrelReachabilityScenarios.closeDuringApproach(helper);
	}

	/** An enclosed tree must not suppress normal avoidance of Mushroom. */
	@GameTest(template = "mushroom_yorkie_gametest:fetch_arena", timeoutTicks = 160)
	public void squirrelFleesWhenTreeUnreachable(GameTestHelper helper) {
		SquirrelOtherGoalScenarios.fleeBlockedTree(helper);
	}

	/** A known enclosed tree must not draw the squirrel away from a player holding berries. */
	@GameTest(template = "mushroom_yorkie_gametest:fetch_arena", timeoutTicks = 160)
	public void squirrelAcceptsTemptingWithUnreachableTree(GameTestHelper helper) {
		SquirrelOtherGoalScenarios.temptBlockedTree(helper);
	}

	/** Select a clear climbing face when a low branch blocks the nearest standable approach. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 240)
	public void squirrelUsesAnotherTreeFace(GameTestHelper helper) {
		for (int x = 1; x <= 6; x++) {
			for (int z = 1; z <= 6; z++) {
				helper.setBlock(x, 0, z, Blocks.STONE);
			}
		}
		for (int y = 1; y <= 5; y++) {
			helper.setBlock(4, y, 4, Blocks.OAK_LOG);
		}
		helper.setBlock(4, 3, 3, Blocks.OAK_LEAVES);
		SquirrelEntity squirrel = helper.spawn(ModEntities.SQUIRREL, 4, 1, 1);
		double initialY = squirrel.getY();
		helper.succeedWhen(() -> helper.assertTrue(squirrel.hasFoundTree() && squirrel.getY() >= initialY + 3.8D,
				"Squirrel never reached the clear tree face: " + squirrel.position()));
	}
}
