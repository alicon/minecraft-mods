package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.item.ModItems;
import net.minecraft.core.component.DataComponents;
import net.minecraft.world.food.FoodProperties;
import net.minecraft.world.item.ItemStack;

final class MushroomFoodPolicy {
	private MushroomFoodPolicy() {
	}

	static boolean isFood(ItemStack stack) {
		return isYorkieTreat(stack) || isPlayerFood(stack);
	}

	static boolean isYorkieTreat(ItemStack stack) {
		return stack.is(ModItems.YORKIE_TREAT);
	}

	static boolean isPlayerFood(ItemStack stack) {
		return !stack.isEmpty() && stack.has(DataComponents.FOOD);
	}

	static int nutrition(ItemStack stack) {
		FoodProperties food = stack.get(DataComponents.FOOD);
		return food == null ? 0 : food.nutrition();
	}
}
