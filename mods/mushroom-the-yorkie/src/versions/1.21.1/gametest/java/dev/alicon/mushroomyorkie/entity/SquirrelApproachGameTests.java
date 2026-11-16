package dev.alicon.mushroomyorkie.entity;

import net.minecraft.gametest.framework.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.nbt.CompoundTag;
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

	/** Keep the native approach across a one-block rise and drop starting at x5. */
	@GameTest(template = "mushroom_yorkie_gametest:fetch_arena", timeoutTicks = 340)
	public void squirrelApproachesAcrossStep5(GameTestHelper helper) {
		SquirrelUnevenApproachScenarios.step(helper, 5);
	}

	/** Keep the native approach across a one-block rise and drop starting at x6. */
	@GameTest(template = "mushroom_yorkie_gametest:fetch_arena", timeoutTicks = 340)
	public void squirrelApproachesAcrossStep6(GameTestHelper helper) {
		SquirrelUnevenApproachScenarios.step(helper, 6);
	}

	/** Keep the native approach across a one-block rise and drop starting at x7. */
	@GameTest(template = "mushroom_yorkie_gametest:fetch_arena", timeoutTicks = 340)
	public void squirrelApproachesAcrossStep7(GameTestHelper helper) {
		SquirrelUnevenApproachScenarios.step(helper, 7);
	}

	/** Waiting for native ground contact must not preserve an unowned saved no-gravity flag. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 340)
	public void squirrelResumesSavedPerch(GameTestHelper helper) {
		SquirrelReloadApproachScenarios.savedPerch(helper, squirrel -> roundTrip(helper, squirrel));
	}

	/** A saved no-gravity flag cannot keep the squirrel aloft after its tree is removed. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 340)
	public void squirrelReleasesRemovedSavedPerch(GameTestHelper helper) {
		SquirrelReloadApproachScenarios.removedSavedPerch(helper, squirrel -> roundTrip(helper, squirrel));
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

	/** Observe recovery after a reachable native sprint attack. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 340)
	public void squirrelAttackMidClimbNorth(GameTestHelper helper) {
		SquirrelInterruptionScenarios.attack(helper, false, false);
	}

	/** Observe recovery after a reachable native sprint attack. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 340)
	public void squirrelAttackMidClimbSouth(GameTestHelper helper) {
		SquirrelInterruptionScenarios.attack(helper, false, true);
	}

	/** Observe recovery after a reachable native sprint attack. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 340)
	public void squirrelAttackPerchedNorth(GameTestHelper helper) {
		SquirrelInterruptionScenarios.attack(helper, true, false);
	}

	/** Observe recovery after a reachable native sprint attack. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 340)
	public void squirrelAttackPerchedSouth(GameTestHelper helper) {
		SquirrelInterruptionScenarios.attack(helper, true, true);
	}

	/** Adding a solid block during ascent must permit a different usable face. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 340)
	public void squirrelReplansBlockedClimbingFace(GameTestHelper helper) {
		SquirrelInterruptionScenarios.closeClimbingFace(helper);
	}

	/** Changing the old route below a supported perch must not cause a needless fall. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 340)
	public void squirrelKeepsPerchAboveChangedFace(GameTestHelper helper) {
		SquirrelInterruptionScenarios.closeBelowPerch(helper);
	}

	/** Removing a canopy above the original target must not release the existing climb. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 340)
	public void squirrelKeepsClimbWhenCanopyOpens(GameTestHelper helper) {
		SquirrelInterruptionScenarios.openCanopy(helper);
	}

	/** Changing a face below the body must not release an otherwise clear remaining ascent. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 340)
	public void squirrelKeepsClimbWhenLowerFaceCloses(GameTestHelper helper) {
		SquirrelInterruptionScenarios.closeBelowAscent(helper);
	}

	/** A harmless new block below an intact perch must not cause a fall on native reload. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 340)
	public void squirrelResumesSavedPerchWithChangedLowerFace(GameTestHelper helper) {
		SquirrelReloadApproachScenarios.changedLowerFace(helper, squirrel -> roundTrip(helper, squirrel));
	}

	/** Reject an artificial saved no-gravity input outside a valid physical perch. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 120)
	public void squirrelRejectsSavedPerchHorizontalGap(GameTestHelper helper) {
		SquirrelPerchBoundaryScenarios.observe(helper, squirrel -> roundTrip(helper, squirrel), "horizontal-gap");
	}

	/** Reject an artificial saved no-gravity input outside a valid physical perch. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 120)
	public void squirrelRejectsSavedPerchAboveLog(GameTestHelper helper) {
		SquirrelPerchBoundaryScenarios.observe(helper, squirrel -> roundTrip(helper, squirrel), "above-log");
	}

	/** Reject an artificial saved no-gravity input outside a valid physical perch. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 120)
	public void squirrelRejectsSavedPerchShortColumn(GameTestHelper helper) {
		SquirrelPerchBoundaryScenarios.observe(helper, squirrel -> roundTrip(helper, squirrel), "short-column");
	}

	/** Reload must retain which original top log owns a stable perch. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 340)
	public void squirrelReleasesOriginalTopAfterReload(GameTestHelper helper) {
		SquirrelReloadApproachScenarios.trackedTopAfterReload(helper, squirrel -> roundTrip(helper, squirrel));
	}

	private static SquirrelEntity roundTrip(GameTestHelper helper, SquirrelEntity squirrel) {
		CompoundTag data = squirrel.saveWithoutId(new CompoundTag());
		squirrel.discard();
		SquirrelEntity restored = new SquirrelEntity(ModEntities.SQUIRREL, helper.getLevel());
		restored.load(data);
		helper.getLevel().addFreshEntity(restored);
		return restored;
	}
}
