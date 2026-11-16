package dev.alicon.mushroomyorkie.entity;

import net.minecraft.gametest.framework.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;

/** Version-specific registration for shared fetch flight regressions. */
public final class FetchFlightGameTests {
	/** Flight steering must honor the active fetch rather than pulling Mushroom back to the owner. */
	@GameTest(template = "mushroom_yorkie_gametest:fetch_arena")
	public void flyingOwnerFetchReturns(GameTestHelper helper) {
		FetchFlightScenarios.flyingOwnerFetchReturns(helper);
	}

	/** An interrupted fetch must clear its flight target before ordinary owner following resumes. */
	@GameTest(template = "mushroom_yorkie_gametest:fetch_arena")
	public void interruptedFlightReturnsToOwner(GameTestHelper helper) {
		FetchFlightScenarios.interruptedFlightReturnsToOwner(helper);
	}

	/** A fetched toy below a floor must return through open air rather than stall beneath the owner. */
	@GameTest(template = "mushroom_yorkie_gametest:fetch_arena")
	public void flyingFetchReturnsFromBelowPlatform(GameTestHelper helper) {
		FetchFlightScenarios.flyingFetchReturnsFromBelowPlatform(helper);
	}

	/** Fractional owner height must not cause ascent and path-node steering to oscillate. */
	@GameTest(template = "mushroom_yorkie_gametest:fetch_arena")
	public void fractionalOwnerHeightReturns(GameTestHelper helper) {
		FetchFlightScenarios.fractionalOwnerHeightReturns(helper);
	}
	/** An airborne fetch must finish safely when its creative owner lands after pickup. */
	@GameTest(template = "mushroom_yorkie_gametest:fetch_arena")
	public void landingAfterPickupReturns(GameTestHelper helper) {
		FetchFlightScenarios.landingAfterPickupReturns(helper);
	}
	/** Landing during the chase must retain its safe flight route through pickup and return. */
	@GameTest(template = "mushroom_yorkie_gametest:fetch_arena")
	public void landingDuringChaseReturns(GameTestHelper helper) {
		FetchFlightScenarios.landingDuringChaseReturns(helper);
	}

	/** Reject an out-of-bounds toy and remove the exact failed fixture entities. */
	@GameTest(template = "fabric-gametest-api-v1:empty")
	public void invalidFootprintDoesNotLeakFixtures(GameTestHelper helper) {
		FetchFlightScenarios.invalidFootprintDoesNotLeakFixtures(helper);
	}
}
