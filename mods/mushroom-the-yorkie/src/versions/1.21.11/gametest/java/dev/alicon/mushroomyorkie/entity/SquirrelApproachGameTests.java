package dev.alicon.mushroomyorkie.entity;

import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.util.ProblemReporter;
import net.minecraft.world.level.storage.TagValueInput;
import net.minecraft.world.level.storage.TagValueOutput;
import net.minecraft.world.level.block.Blocks;

/** A blocked nearby trunk face must not hide an otherwise usable tree. */
public final class SquirrelApproachGameTests {
	/** Observe the centered north start that previously circled before climbing. */
	@GameTest(maxTicks = 340)
	public void squirrelCenteredNorthRoute(GameTestHelper helper) {
		SquirrelRouteScenarios.observe(helper, "centered-north", 4.5D, 1.5D);
	}

	/** Observe the offset north start without replacing its native navigation. */
	@GameTest(maxTicks = 340)
	public void squirrelOffsetNorthRoute(GameTestHelper helper) {
		SquirrelRouteScenarios.observe(helper, "offset-north", 4.8D, 1.5D);
	}

	/** Observe the nearer blocked-branch start from the live trace. */
	@GameTest(maxTicks = 340)
	public void squirrelNearBranchRoute(GameTestHelper helper) {
		SquirrelRouteScenarios.observe(helper, "near-branch", 4.8D, 2.5D);
	}

	/** Keep the previously faster start as a neighboring route control. */
	@GameTest(maxTicks = 340)
	public void squirrelWestNorthRoute(GameTestHelper helper) {
		SquirrelRouteScenarios.observe(helper, "west-north", 3.8D, 1.5D);
	}

	/** Keep native approach and climb stable from the south side. */
	@GameTest(maxTicks = 340)
	public void squirrelSouthRoute(GameTestHelper helper) {
		SquirrelRouteScenarios.observe(helper, "south", 4.8D, 6.2D);
	}

	/** Keep native approach and climb stable from the east side. */
	@GameTest(maxTicks = 340)
	public void squirrelEastRoute(GameTestHelper helper) {
		SquirrelRouteScenarios.observe(helper, "east", 6.2D, 4.8D);
	}

	/** Keep native approach and climb stable from the west side. */
	@GameTest(maxTicks = 340)
	public void squirrelWestRoute(GameTestHelper helper) {
		SquirrelRouteScenarios.observe(helper, "west", 2.2D, 4.8D);
	}

	/** Keep native approach and climb stable from the near-west side. */
	@GameTest(maxTicks = 340)
	public void squirrelNearWestRoute(GameTestHelper helper) {
		SquirrelRouteScenarios.observe(helper, "near-west", 3.2D, 4.2D);
	}

	/** Removing the climbed trunk must restore gravity and allow a native landing. */
	@GameTest(maxTicks = 340)
	public void squirrelReleasesRemovedTree(GameTestHelper helper) {
		SquirrelRouteScenarios.removeClimbedTree(helper);
	}

	/** A blocked nearby tree must not hide a farther reachable tree. */
	@GameTest(maxTicks = 340)
	public void squirrelChoosesReachableAlternative(GameTestHelper helper) {
		SquirrelReachabilityScenarios.alternativeTree(helper, true);
	}

	/** With the barrier removed, keep the nearer tree as the control. */
	@GameTest(maxTicks = 340)
	public void squirrelKeepsOpenNearestTree(GameTestHelper helper) {
		SquirrelReachabilityScenarios.alternativeTree(helper, false);
	}

	/** Prove the alternative tree itself is reachable with native movement. */
	@GameTest(maxTicks = 340)
	public void squirrelReachesFartherTreeAlone(GameTestHelper helper) {
		SquirrelReachabilityScenarios.fartherTreeOnly(helper);
	}

	/** Reach another face of the same tree when the nearest face is enclosed. */
	@GameTest(maxTicks = 340)
	public void squirrelSkipsBlockedFace(GameTestHelper helper) {
		SquirrelReachabilityScenarios.blockedFaceOnly(helper);
	}

	/** Without a reachable tree, normal avoidance must still move away from Mushroom. */
	@GameTest(structure = "mushroom_yorkie_gametest:fetch_arena", maxTicks = 160)
	public void squirrelFleesWithoutTree(GameTestHelper helper) {
		SquirrelOtherGoalScenarios.flee(helper);
	}

	/** Without a tree, a squirrel can still walk to a player holding berries. */
	@GameTest(structure = "mushroom_yorkie_gametest:fetch_arena", maxTicks = 160)
	public void squirrelAcceptsTemptingWithoutTree(GameTestHelper helper) {
		SquirrelOtherGoalScenarios.tempt(helper);
	}

	/** A wall built ahead during approach must trigger a reachable alternative. */
	@GameTest(maxTicks = 340)
	public void squirrelReplansClosedApproach(GameTestHelper helper) {
		SquirrelReachabilityScenarios.closeDuringApproach(helper);
	}

	/** An enclosed tree must not suppress normal avoidance of Mushroom. */
	@GameTest(structure = "mushroom_yorkie_gametest:fetch_arena", maxTicks = 160)
	public void squirrelFleesWhenTreeUnreachable(GameTestHelper helper) {
		SquirrelOtherGoalScenarios.fleeBlockedTree(helper);
	}

	/** A known enclosed tree must not draw the squirrel away from a player holding berries. */
	@GameTest(structure = "mushroom_yorkie_gametest:fetch_arena", maxTicks = 160)
	public void squirrelAcceptsTemptingWithUnreachableTree(GameTestHelper helper) {
		SquirrelOtherGoalScenarios.temptBlockedTree(helper);
	}

	/** Keep the native approach across a one-block rise and drop starting at x5. */
	@GameTest(structure = "mushroom_yorkie_gametest:fetch_arena", maxTicks = 340)
	public void squirrelApproachesAcrossStep5(GameTestHelper helper) {
		SquirrelUnevenApproachScenarios.step(helper, 5);
	}

	/** Keep the native approach across a one-block rise and drop starting at x6. */
	@GameTest(structure = "mushroom_yorkie_gametest:fetch_arena", maxTicks = 340)
	public void squirrelApproachesAcrossStep6(GameTestHelper helper) {
		SquirrelUnevenApproachScenarios.step(helper, 6);
	}

	/** Keep the native approach across a one-block rise and drop starting at x7. */
	@GameTest(structure = "mushroom_yorkie_gametest:fetch_arena", maxTicks = 340)
	public void squirrelApproachesAcrossStep7(GameTestHelper helper) {
		SquirrelUnevenApproachScenarios.step(helper, 7);
	}

	/** Waiting for native ground contact must not preserve an unowned saved no-gravity flag. */
	@GameTest(maxTicks = 340)
	public void squirrelResumesSavedPerch(GameTestHelper helper) {
		SquirrelReloadApproachScenarios.savedPerch(helper, squirrel -> roundTrip(helper, squirrel));
	}

	/** A saved no-gravity flag cannot keep the squirrel aloft after its tree is removed. */
	@GameTest(maxTicks = 340)
	public void squirrelReleasesRemovedSavedPerch(GameTestHelper helper) {
		SquirrelReloadApproachScenarios.removedSavedPerch(helper, squirrel -> roundTrip(helper, squirrel));
	}

	/** Select a clear climbing face when a low branch blocks the nearest standable approach. */
	@GameTest(maxTicks = 240)
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
	@GameTest(structure = "mushroom_yorkie_gametest:fetch_arena", maxTicks = 340)
	public void squirrelAttackMidClimbNorth(GameTestHelper helper) {
		SquirrelInterruptionScenarios.attack(helper, false, false);
	}

	/** Observe recovery after a reachable native sprint attack. */
	@GameTest(structure = "mushroom_yorkie_gametest:fetch_arena", maxTicks = 340)
	public void squirrelAttackMidClimbSouth(GameTestHelper helper) {
		SquirrelInterruptionScenarios.attack(helper, false, true);
	}

	/** Observe recovery after a reachable native sprint attack. */
	@GameTest(structure = "mushroom_yorkie_gametest:fetch_arena", maxTicks = 340)
	public void squirrelAttackPerchedNorth(GameTestHelper helper) {
		SquirrelInterruptionScenarios.attack(helper, true, false);
	}

	/** Observe recovery after a reachable native sprint attack. */
	@GameTest(structure = "mushroom_yorkie_gametest:fetch_arena", maxTicks = 340)
	public void squirrelAttackPerchedSouth(GameTestHelper helper) {
		SquirrelInterruptionScenarios.attack(helper, true, true);
	}

	/** Adding a solid block during ascent must permit a different usable face. */
	@GameTest(maxTicks = 340)
	public void squirrelReplansBlockedClimbingFace(GameTestHelper helper) {
		SquirrelInterruptionScenarios.closeClimbingFace(helper);
	}

	/** Changing the old route below a supported perch must not cause a needless fall. */
	@GameTest(maxTicks = 340)
	public void squirrelKeepsPerchAboveChangedFace(GameTestHelper helper) {
		SquirrelInterruptionScenarios.closeBelowPerch(helper);
	}

	/** Removing a canopy above the original target must not release the existing climb. */
	@GameTest(maxTicks = 340)
	public void squirrelKeepsClimbWhenCanopyOpens(GameTestHelper helper) {
		SquirrelInterruptionScenarios.openCanopy(helper);
	}

	/** Changing a face below the body must not release an otherwise clear remaining ascent. */
	@GameTest(maxTicks = 340)
	public void squirrelKeepsClimbWhenLowerFaceCloses(GameTestHelper helper) {
		SquirrelInterruptionScenarios.closeBelowAscent(helper);
	}

	/** A harmless new block below an intact perch must not cause a fall on native reload. */
	@GameTest(maxTicks = 340)
	public void squirrelResumesSavedPerchWithChangedLowerFace(GameTestHelper helper) {
		SquirrelReloadApproachScenarios.changedLowerFace(helper, squirrel -> roundTrip(helper, squirrel));
	}

	/** Reject an artificial saved no-gravity input outside a valid physical perch. */
	@GameTest(maxTicks = 120)
	public void squirrelRejectsSavedPerchHorizontalGap(GameTestHelper helper) {
		SquirrelPerchBoundaryScenarios.observe(helper, squirrel -> roundTrip(helper, squirrel), "horizontal-gap");
	}

	/** Reject an artificial saved no-gravity input outside a valid physical perch. */
	@GameTest(maxTicks = 120)
	public void squirrelRejectsSavedPerchAboveLog(GameTestHelper helper) {
		SquirrelPerchBoundaryScenarios.observe(helper, squirrel -> roundTrip(helper, squirrel), "above-log");
	}

	/** Reject an artificial saved no-gravity input outside a valid physical perch. */
	@GameTest(maxTicks = 120)
	public void squirrelRejectsSavedPerchShortColumn(GameTestHelper helper) {
		SquirrelPerchBoundaryScenarios.observe(helper, squirrel -> roundTrip(helper, squirrel), "short-column");
	}

	/** Reload must retain which original top log owns a stable perch. */
	@GameTest(maxTicks = 340)
	public void squirrelReleasesOriginalTopAfterReload(GameTestHelper helper) {
		SquirrelReloadApproachScenarios.trackedTopAfterReload(helper, squirrel -> roundTrip(helper, squirrel));
	}

	/** Apply the same physical support rule before and after native reload. */
	@GameTest(maxTicks = 340)
	public void squirrelSupportChangeLiveGround(GameTestHelper helper) {
		SquirrelSupportChangeScenarios.observe(helper, squirrel -> roundTrip(helper, squirrel), false, false);
	}

	/** Apply the same physical support rule before and after native reload. */
	@GameTest(maxTicks = 340)
	public void squirrelSupportChangeLiveMiddle(GameTestHelper helper) {
		SquirrelSupportChangeScenarios.observe(helper, squirrel -> roundTrip(helper, squirrel), false, true);
	}

	/** Apply the same physical support rule before and after native reload. */
	@GameTest(maxTicks = 340)
	public void squirrelSupportChangeReloadedGround(GameTestHelper helper) {
		SquirrelSupportChangeScenarios.observe(helper, squirrel -> roundTrip(helper, squirrel), true, false);
	}

	/** Apply the same physical support rule before and after native reload. */
	@GameTest(maxTicks = 340)
	public void squirrelSupportChangeReloadedMiddle(GameTestHelper helper) {
		SquirrelSupportChangeScenarios.observe(helper, squirrel -> roundTrip(helper, squirrel), true, true);
	}

	/** Saving immediately after a hit must not reclaim a perch and erase its native impulse. */
	@GameTest(structure = "mushroom_yorkie_gametest:fetch_arena", maxTicks = 340)
	public void squirrelSavedNativeHitNorth(GameTestHelper helper) {
		SquirrelInterruptionScenarios.savedAttack(helper, squirrel -> roundTrip(helper, squirrel), false);
	}

	/** Saving immediately after a hit must not reclaim a perch and erase its native impulse. */
	@GameTest(structure = "mushroom_yorkie_gametest:fetch_arena", maxTicks = 340)
	public void squirrelSavedNativeHitSouth(GameTestHelper helper) {
		SquirrelInterruptionScenarios.savedAttack(helper, squirrel -> roundTrip(helper, squirrel), true);
	}

	private static SquirrelEntity roundTrip(GameTestHelper helper, SquirrelEntity squirrel) {
		var problems = new ProblemReporter.Collector();
		var output = TagValueOutput.createWithContext(problems, helper.getLevel().registryAccess());
		squirrel.saveWithoutId(output);
		var data = output.buildResult();
		helper.assertTrue(problems.isEmpty(), "Squirrel save problems: " + problems.getReport());
		squirrel.discard();
		SquirrelEntity restored = new SquirrelEntity(ModEntities.SQUIRREL, helper.getLevel());
		restored.load(TagValueInput.create(problems, helper.getLevel().registryAccess(), data));
		helper.assertTrue(problems.isEmpty(), "Squirrel load problems: " + problems.getReport());
		helper.getLevel().addFreshEntity(restored);
		return restored;
	}
}
