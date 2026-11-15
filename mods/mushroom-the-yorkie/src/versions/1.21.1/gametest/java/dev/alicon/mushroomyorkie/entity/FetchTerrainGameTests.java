package dev.alicon.mushroomyorkie.entity;

import net.minecraft.gametest.framework.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;

/** Version-specific registration for shared terrain pickup regressions. */
public final class FetchTerrainGameTests {
	/** A planned dry shoreline endpoint must be close enough to collect the floating toy. */
	@GameTest(template = "fabric-gametest-api-v1:empty")
	public void waterEdgePathAllowsPickup(GameTestHelper helper) {
		FetchTerrainScenarios.waterEdgePathAllowsPickup(helper);
	}
}
