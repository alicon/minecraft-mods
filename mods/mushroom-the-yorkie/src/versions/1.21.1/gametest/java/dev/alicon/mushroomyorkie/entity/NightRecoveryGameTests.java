package dev.alicon.mushroomyorkie.entity;

import net.minecraft.gametest.framework.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;

/** Version-specific registration of night recovery and outdoor-trip controls. */
public final class NightRecoveryGameTests {
	/** Survival night recovery must not request an unrelated outside trip. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 40)
	public void survivalNightRecovery(GameTestHelper helper) {
		NightRecoveryScenarios.recoveryKeepsNightRoutine(helper, false);
	}

	/** Creative night recovery keeps the same routine and physical safety guards. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 40)
	public void creativeNightRecovery(GameTestHelper helper) {
		NightRecoveryScenarios.recoveryKeepsNightRoutine(helper, true);
	}
}
