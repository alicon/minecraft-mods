package dev.alicon.mushroomyorkie.gametest;

import net.minecraft.gametest.framework.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;

/** Version-specific registration of native crafting checks for every Mushroom recipe. */
public final class RecipeCraftingGameTests {
	/** Loaded dog bowl recipe must produce its intended item and quantity. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 20)
	public void craftDogBowl(GameTestHelper helper) {
		RecipeCraftingScenarios.craft(helper, "dog_bowl");
	}

	/** Loaded dog food bowl recipe must produce its intended item and quantity. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 20)
	public void craftDogFoodBowl(GameTestHelper helper) {
		RecipeCraftingScenarios.craft(helper, "dog_food_bowl");
	}

	/** Loaded dog water bowl recipe must produce its intended item and quantity. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 20)
	public void craftDogWaterBowl(GameTestHelper helper) {
		RecipeCraftingScenarios.craft(helper, "dog_water_bowl");
	}

	/** Loaded yorkie ball recipe must produce its intended item and quantity. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 20)
	public void craftYorkieBall(GameTestHelper helper) {
		RecipeCraftingScenarios.craft(helper, "yorkie_ball");
	}

	/** Loaded yorkie chew toy recipe must produce its intended item and quantity. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 20)
	public void craftYorkieChewToy(GameTestHelper helper) {
		RecipeCraftingScenarios.craft(helper, "yorkie_chew_toy");
	}

	/** Loaded yorkie treat recipe must produce its intended item and quantity. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 20)
	public void craftYorkieTreat(GameTestHelper helper) {
		RecipeCraftingScenarios.craft(helper, "yorkie_treat");
	}

	/** Loaded dog bed recipe must produce its intended item and quantity. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 20)
	public void craftDogBed(GameTestHelper helper) {
		RecipeCraftingScenarios.craft(helper, "dog_bed");
	}

	/** Loaded yorkie harness recipe must produce its intended item and quantity. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 20)
	public void craftYorkieHarness(GameTestHelper helper) {
		RecipeCraftingScenarios.craft(helper, "yorkie_harness");
	}

	/** Craft padding from wool of any color, leather and string. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 20)
	public void craftPaddedVest(GameTestHelper helper) {
		RecipeCraftingScenarios.craft(helper, "padded_vest");
	}

	/** A mixed wool and string recipe makes a portable camp marker. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 20)
	public void craftCampMat(GameTestHelper helper) {
		RecipeCraftingScenarios.craft(helper, "camp_mat");
	}

	/** Loaded doghouse recipe must produce its intended item and quantity. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 20)
	public void craftDoghouse(GameTestHelper helper) {
		RecipeCraftingScenarios.craft(helper, "doghouse");
	}

	/** Vanilla dyeing remains available without the string used for toys. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 20)
	public void craftVanillaLimeWool(GameTestHelper helper) {
		RecipeCraftingScenarios.craft(helper, "vanilla_lime_wool");
	}

	/** Vanilla dyeing remains available without the string used for toys. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 20)
	public void craftVanillaYellowWool(GameTestHelper helper) {
		RecipeCraftingScenarios.craft(helper, "vanilla_yellow_wool");
	}
	/** Crafts a reusable replacement Field Guide with ordinary crafting. */
	@GameTest(template = "fabric-gametest-api-v1:empty")
	public void craftsFieldGuide(GameTestHelper helper) {
		RecipeCraftingScenarios.craft(helper, "field_guide");
	}

}
