package dev.alicon.mushroomyorkie.entity;

import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;

/** Version-specific registration for shared wet-rest state transitions. */
public final class WaterRestGameTests {
	/** Water clears existing sleep, blocks sleep/sit requests, and permits sleep again once dry. */
	@GameTest
	public void waterClearsSleepAndRejectsRest(GameTestHelper helper) {
		WaterRestScenarios.waterClearsSleepAndRejectsRest(helper);
	}
	/** Creative recovery must route out of a deep pool to a grounded owner. */
	@GameTest
	public void creativeRecoveryReachesDryBank(GameTestHelper helper) {
		WaterRecoveryScenarios.creativeRecoveryReachesDryBank(helper);
	}
}
