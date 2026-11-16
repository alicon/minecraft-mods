package dev.alicon.mushroomyorkie.gametest;

import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;

/** Version-specific registration of native crafting checks for every Mushroom recipe. */
public final class RecipeCraftingGameTests {
	/** Loaded dog bowl recipe must produce its intended item and quantity. */
	@GameTest(maxTicks = 20)
	public void craftDogBowl(GameTestHelper helper) {
		RecipeCraftingScenarios.craft(helper, "dog_bowl");
	}

	/** Loaded dog food bowl recipe must produce its intended item and quantity. */
	@GameTest(maxTicks = 20)
	public void craftDogFoodBowl(GameTestHelper helper) {
		RecipeCraftingScenarios.craft(helper, "dog_food_bowl");
	}

	/** Loaded dog water bowl recipe must produce its intended item and quantity. */
	@GameTest(maxTicks = 20)
	public void craftDogWaterBowl(GameTestHelper helper) {
		RecipeCraftingScenarios.craft(helper, "dog_water_bowl");
	}

	/** Loaded yorkie ball recipe must produce its intended item and quantity. */
	@GameTest(maxTicks = 20)
	public void craftYorkieBall(GameTestHelper helper) {
		RecipeCraftingScenarios.craft(helper, "yorkie_ball");
	}

	/** Loaded yorkie chew toy recipe must produce its intended item and quantity. */
	@GameTest(maxTicks = 20)
	public void craftYorkieChewToy(GameTestHelper helper) {
		RecipeCraftingScenarios.craft(helper, "yorkie_chew_toy");
	}

	/** Loaded yorkie treat recipe must produce its intended item and quantity. */
	@GameTest(maxTicks = 20)
	public void craftYorkieTreat(GameTestHelper helper) {
		RecipeCraftingScenarios.craft(helper, "yorkie_treat");
	}

	/** Loaded dog bed recipe must produce its intended item and quantity. */
	@GameTest(maxTicks = 20)
	public void craftDogBed(GameTestHelper helper) {
		RecipeCraftingScenarios.craft(helper, "dog_bed");
	}

	/** Loaded yorkie harness recipe must produce its intended item and quantity. */
	@GameTest(maxTicks = 20)
	public void craftYorkieHarness(GameTestHelper helper) {
		RecipeCraftingScenarios.craft(helper, "yorkie_harness");
	}

	/** Loaded doghouse recipe must produce its intended item and quantity. */
	@GameTest(maxTicks = 20)
	public void craftDoghouse(GameTestHelper helper) {
		RecipeCraftingScenarios.craft(helper, "doghouse");
	}

	/** Vanilla dyeing remains available without the string used for toys. */
	@GameTest(maxTicks = 20)
	public void craftVanillaLimeWool(GameTestHelper helper) {
		RecipeCraftingScenarios.craft(helper, "vanilla_lime_wool");
	}

	/** Vanilla dyeing remains available without the string used for toys. */
	@GameTest(maxTicks = 20)
	public void craftVanillaYellowWool(GameTestHelper helper) {
		RecipeCraftingScenarios.craft(helper, "vanilla_yellow_wool");
	}

	/** Copper unpacking stays vanilla and does not create a dog bowl. */
	@GameTest(maxTicks = 20)
	public void craftVanillaCopperNuggets(GameTestHelper helper) {
		RecipeCraftingScenarios.copperNuggets(helper, net.minecraft.world.item.Items.COPPER_NUGGET);
	}
}
