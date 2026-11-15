package dev.alicon.mushroomyorkie.entity;

import net.minecraft.gametest.framework.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;

/** Version-specific registration for the shared outdoor-trip lifecycle regression. */
public final class OutdoorReliefGameTests {
	/** Stay outside until daily relief completes, while respecting an explicit sit order. */
	@GameTest(template = "fabric-gametest-api-v1:empty")
	public void outdoorTripWaitsForRelief(GameTestHelper helper) {
		OutdoorReliefScenarios.outdoorTripWaitsForRelief(helper);
	}
	/** Ordinary outdoor need decay must not cancel a trip or its in-progress relief timer. */
	@GameTest(template = "fabric-gametest-api-v1:empty")
	public void outdoorTripSurvivesNeedDecay(GameTestHelper helper) {
		OutdoorReliefScenarios.outdoorTripSurvivesNeedDecay(helper);
	}
}
