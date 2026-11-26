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

	/** The native fetch goal must retrieve the original ball through short grass. */
	@GameTest(maxTicks = 200)
	public void fetchThroughShortGrass(GameTestHelper helper) {
		FetchTerrainScenarios.fetchThroughGrass(helper, false);
	}

	/** The native fetch goal must retrieve the original ball through tall grass. */
	@GameTest(maxTicks = 200)
	public void fetchThroughTallGrass(GameTestHelper helper) {
		FetchTerrainScenarios.fetchThroughGrass(helper, true);
	}

	/** Two players can throw without one dog taking the other player's toy. */
	@GameTest
	public void fetchKeepsEachOwnersToy(GameTestHelper helper) {
		FetchTerrainScenarios.fetchKeepsEachOwnersToy(helper);
	}
}
