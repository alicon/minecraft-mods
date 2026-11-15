package dev.alicon.mushroomyorkie.entity;

import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;

/** Version-specific registration for shared terrain pickup regressions. */
public final class FetchTerrainGameTests {
	/** A planned dry shoreline endpoint must be close enough to collect the floating toy. */
	@GameTest
	public void waterEdgePathAllowsPickup(GameTestHelper helper) {
		FetchTerrainScenarios.waterEdgePathAllowsPickup(helper);
	}
}
