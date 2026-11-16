package dev.alicon.playtestbridge;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.crafting.CraftingInput;
import net.minecraft.world.item.crafting.CraftingRecipe;
import net.minecraft.world.item.crafting.RecipeType;

final class BridgeCraftingActions {
	private BridgeCraftingActions() {
	}

	static JsonObject check(ServerPlayer player, JsonObject body) {
		try {
			return resolve(player, body);
		} catch (IllegalArgumentException exception) {
			JsonObject error = new JsonObject();
			error.addProperty("ok", false);
			error.addProperty("error", exception.getMessage());
			return error;
		}
	}

	private static JsonObject resolve(ServerPlayer player, JsonObject body) {
		if (!(player.level() instanceof ServerLevel level)) {
			throw new IllegalArgumentException("player is not in a server level");
		}
		BridgeCraftingGrid grid = BridgeCraftingGrid.parse(body);
		List<ItemStack> slots = new ArrayList<>();
		for (String id : grid.slots()) {
			var item = BuiltInRegistries.ITEM.getOptional(Identifier.parse(id))
					.orElseThrow(() -> new IllegalArgumentException("Unknown crafting item: " + id));
			slots.add(id.equals("minecraft:air") ? ItemStack.EMPTY : new ItemStack(item));
		}
		CraftingInput input = CraftingInput.of(grid.width(), grid.height(), slots);
		var recipes = level.getServer().getRecipeManager();
		var selected = recipes.getRecipeFor(RecipeType.CRAFTING, input, level);
		JsonArray matches = new JsonArray();
		for (var recipe : recipes.getRecipes()) {
			if (recipe.value() instanceof CraftingRecipe crafting && crafting.matches(input, level)) {
				matches.add(recipe.id().identifier().toString());
			}
		}
		JsonObject response = new JsonObject();
		response.addProperty("ok", true);
		response.addProperty("mode", "read_only_recipe_resolution");
		response.addProperty("matched", selected.isPresent());
		response.add("matchingRecipes", matches);
		response.add("result", BridgeEntityState.itemStack(selected.map(recipe -> recipe.value().assemble(input, level.registryAccess())).orElse(ItemStack.EMPTY)));
		selected.ifPresent(recipe -> response.addProperty("selectedRecipe", recipe.id().identifier().toString()));
		return response;
	}
}
