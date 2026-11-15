package dev.alicon.mushroomyorkie.entity;

import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;

/** Version-specific registration for shared fetch flight regressions. */
public final class FetchFlightGameTests {
	/** Flight steering must honor the active fetch rather than pulling Mushroom back to the owner. */
	@GameTest
	public void flyingOwnerFetchReturns(GameTestHelper helper) {
		FetchFlightScenarios.flyingOwnerFetchReturns(helper);
	}

	/** An interrupted fetch must clear its flight target before ordinary owner following resumes. */
	@GameTest
	public void interruptedFlightReturnsToOwner(GameTestHelper helper) {
		FetchFlightScenarios.interruptedFlightReturnsToOwner(helper);
	}

	/** A fetched toy below a floor must return through open air rather than stall beneath the owner. */
	@GameTest
	public void flyingFetchReturnsFromBelowPlatform(GameTestHelper helper) {
		FetchFlightScenarios.flyingFetchReturnsFromBelowPlatform(helper);
	}

	/** Fractional owner height must not cause ascent and path-node steering to oscillate. */
	@GameTest
	public void fractionalOwnerHeightReturns(GameTestHelper helper) {
		FetchFlightScenarios.fractionalOwnerHeightReturns(helper);
	}
}
