package dev.alicon.mushroomyorkie.gametest;

import dev.alicon.mushroomyorkie.item.ModItems;
import java.util.Arrays;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.world.inventory.CraftingMenu;
import net.minecraft.world.inventory.ContainerLevelAccess;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.crafting.CraftingInput;
import net.minecraft.world.item.crafting.CraftingRecipe;
import net.minecraft.world.item.crafting.RecipeType;

/** Craft through loaded recipes; item registration alone cannot prove recipes survived reload. */
final class RecipeCraftingScenarios {
	private RecipeCraftingScenarios() {
	}

	static void craft(GameTestHelper helper, String name) {
		Craft craft = switch (name) {
			case "dog_bowl" -> new Craft(ModItems.DOG_BOWL, 1, grid(3, 2, Items.COPPER_INGOT, null, Items.COPPER_INGOT, null, Items.COPPER_INGOT, null));
			case "dog_food_bowl" -> new Craft(ModItems.DOG_FOOD_BOWL, 1, grid(2, 1, ModItems.DOG_BOWL, ModItems.YORKIE_TREAT));
			case "dog_water_bowl" -> new Craft(ModItems.DOG_WATER_BOWL, 1, grid(2, 1, ModItems.DOG_BOWL, Items.WATER_BUCKET));
			case "yorkie_ball" -> new Craft(ModItems.YORKIE_BALL, 1, grid(3, 1, Items.WHITE_WOOL, Items.LIME_DYE, Items.STRING));
			case "yorkie_chew_toy" -> new Craft(ModItems.YORKIE_CHEW_TOY, 1, grid(3, 1, Items.WHITE_WOOL, Items.YELLOW_DYE, Items.STRING));
			case "yorkie_treat" -> new Craft(ModItems.YORKIE_TREAT, 8, grid(3, 1, Items.MUTTON, Items.BONE, Items.BONE));
			case "vanilla_lime_wool" -> new Craft(Items.LIME_WOOL, 1, grid(2, 1, Items.WHITE_WOOL, Items.LIME_DYE));
			case "vanilla_yellow_wool" -> new Craft(Items.YELLOW_WOOL, 1, grid(2, 1, Items.WHITE_WOOL, Items.YELLOW_DYE));
			case "dog_bed" -> new Craft(ModItems.DOG_BED, 1, grid(3, 2, Items.WHITE_WOOL, Items.WHITE_WOOL, Items.WHITE_WOOL, null, Items.RED_DYE, null));
			case "yorkie_harness" -> new Craft(ModItems.YORKIE_HARNESS, 1, grid(3, 3, Items.STRING, null, Items.STRING,
					Items.LEATHER, Items.BLACK_DYE, Items.LEATHER, null, Items.STRING, null));
			case "doghouse" -> new Craft(ModItems.DOGHOUSE, 1, grid(3, 3, Items.DARK_OAK_PLANKS, Items.DARK_OAK_PLANKS, Items.DARK_OAK_PLANKS,
					Items.CHERRY_PLANKS, Items.LANTERN, Items.CHERRY_PLANKS, Items.CHERRY_PLANKS, Items.RED_WOOL, Items.CHERRY_PLANKS));
			default -> throw new IllegalArgumentException("Unknown crafting fixture: " + name);
		};
		assertCraft(helper, name, craft);
	}

	static void copperNuggets(GameTestHelper helper, Item nuggets) {
		assertCraft(helper, "vanilla copper nuggets", new Craft(nuggets, 9, grid(1, 1, Items.COPPER_INGOT)));
	}

	private static void assertCraft(GameTestHelper helper, String name, Craft craft) {
		var level = helper.getLevel();
		var match = level.getServer().getRecipeManager().getRecipeFor(RecipeType.CRAFTING, craft.input(), level);
		long alternatives = level.getServer().getRecipeManager().getRecipes().stream()
				.filter(recipe -> recipe.value() instanceof CraftingRecipe crafting && crafting.matches(craft.input(), level)).count();
		helper.assertTrue(alternatives == 1, "Crafting " + name + " has " + alternatives + " matches instead of one distinct recipe");
		helper.assertTrue(match.isPresent(), "No loaded crafting recipe matches Mushroom " + name);
		ItemStack result = match.orElseThrow().value().assemble(craft.input(), level.registryAccess());
		helper.assertTrue(result.is(craft.result()) && result.getCount() == craft.count(),
				"Mushroom " + name + " crafted the wrong item or quantity: " + result);
		var player = helper.makeMockServerPlayerInLevel();
		CraftingMenu menu = new CraftingMenu(1, player.getInventory(), ContainerLevelAccess.create(level, player.blockPosition()));
		try {
			for (int y = 0; y < craft.input().height(); y++) {
				for (int x = 0; x < craft.input().width(); x++) {
					menu.getSlot(1 + y * 3 + x).set(craft.input().getItem(y * craft.input().width() + x).copy());
				}
			}
			ItemStack menuResult = menu.getSlot(0).getItem();
			helper.assertTrue(menuResult.is(craft.result()) && menuResult.getCount() == craft.count(),
					"Manual crafting menu for " + name + " produced " + menuResult);
		} finally {
			// This test-owned menu was never opened; clear synthetic inputs without dropping them into other fixtures.
			for (int slot = 1; slot <= 9; slot++) menu.getSlot(slot).set(ItemStack.EMPTY);
		}
		helper.succeed();
	}

	private static CraftingInput grid(int width, int height, Item... items) {
		return CraftingInput.of(width, height, Arrays.stream(items).map(item -> item == null ? ItemStack.EMPTY : new ItemStack(item)).toList());
	}

	private record Craft(Item result, int count, CraftingInput input) {
	}
}
