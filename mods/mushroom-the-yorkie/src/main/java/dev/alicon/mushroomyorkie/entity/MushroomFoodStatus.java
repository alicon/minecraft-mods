package dev.alicon.mushroomyorkie.entity;

import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.player.Player;

final class MushroomFoodStatus {
	private MushroomFoodStatus() {
	}

	static Component inline(MushroomYorkieEntity yorkie) {
		return Component.translatable("message.mushroom_yorkie.food_status_inline", yorkie.needs.foodBar());
	}

	static void show(Player player, MushroomYorkieEntity yorkie) {
		player.displayClientMessage(Component.translatable("message.mushroom_yorkie.food_status", yorkie.needs.foodBar()), true);
	}
}
