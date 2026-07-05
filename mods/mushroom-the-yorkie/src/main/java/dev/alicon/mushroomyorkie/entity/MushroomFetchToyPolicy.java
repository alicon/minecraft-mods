package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.item.ModItems;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

final class MushroomFetchToyPolicy {
	private MushroomFetchToyPolicy() {
	}

	static boolean isFetchToy(ItemStack stack) {
		return stack.is(ModItems.YORKIE_BALL) || stack.is(ModItems.YORKIE_CHEW_TOY) || stack.is(Items.BONE);
	}
}
