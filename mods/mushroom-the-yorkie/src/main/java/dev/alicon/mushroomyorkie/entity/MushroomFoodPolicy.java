package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.item.ModItems;
import net.minecraft.core.component.DataComponents;
import net.minecraft.tags.ItemTags;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.food.FoodProperties;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

final class MushroomFoodPolicy {
	private MushroomFoodPolicy() {
	}

	static boolean isFood(ItemStack stack) {
		return isYorkieTreat(stack) || isPlayerFood(stack);
	}

	static boolean isYorkieTreat(ItemStack stack) {
		return stack.is(ModItems.YORKIE_TREAT);
	}

	static boolean calmsPeacefulMobBarking(ItemStack stack) {
		return isYorkieTreat(stack) || isMeatOrFish(stack);
	}

	static boolean recallsFromPeacefulMob(ItemStack stack) {
		return calmsPeacefulMobBarking(stack) || stack.is(Items.LEATHER);
	}

	static boolean isHoldingPeacefulMobRecallItem(LivingEntity entity) {
		return recallsFromPeacefulMob(entity.getMainHandItem()) || recallsFromPeacefulMob(entity.getOffhandItem());
	}

	static boolean isHoldingPeacefulMobCalmingItem(LivingEntity entity) {
		return calmsPeacefulMobBarking(entity.getMainHandItem()) || calmsPeacefulMobBarking(entity.getOffhandItem());
	}

	static boolean isMeatOrFish(ItemStack stack) {
		return !stack.isEmpty() && (stack.is(ItemTags.MEAT) || stack.is(ItemTags.FISHES));
	}

	static boolean isPlayerFood(ItemStack stack) {
		return !stack.isEmpty() && stack.has(DataComponents.FOOD);
	}

	static int nutrition(ItemStack stack) {
		FoodProperties food = stack.get(DataComponents.FOOD);
		return food == null ? 0 : food.nutrition();
	}
}
