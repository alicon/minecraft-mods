package dev.alicon.mushroomyorkie.entity;

import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;

/** Version-specific registration of night recovery and outdoor-trip controls. */
public final class NightRecoveryGameTests {
	/** Survival night recovery must not request an unrelated outside trip. */
	@GameTest(maxTicks = 40)
	public void survivalNightRecovery(GameTestHelper helper) {
		NightRecoveryScenarios.recoveryKeepsNightRoutine(helper, false);
	}

	/** Creative night recovery keeps the same routine and physical safety guards. */
	@GameTest(maxTicks = 40)
	public void creativeNightRecovery(GameTestHelper helper) {
		NightRecoveryScenarios.recoveryKeepsNightRoutine(helper, true);
	}
}
