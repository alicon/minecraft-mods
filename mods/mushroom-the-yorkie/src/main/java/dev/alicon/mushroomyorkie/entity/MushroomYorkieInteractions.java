package dev.alicon.mushroomyorkie.entity;

import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;

final class MushroomYorkieInteractions {
	private MushroomYorkieInteractions() {
	}

	static InteractionResult handle(MushroomYorkieEntity yorkie, Player player, InteractionHand hand) {
		ItemStack stack = player.getItemInHand(hand);

		InteractionResult handled = MushroomFeedingInteractions.handle(yorkie, player, hand, stack);
		if (handled != null) {
			return handled;
		}

		handled = MushroomHarnessInteractions.handle(yorkie, player, hand, stack);
		if (handled != null) {
			return handled;
		}

		handled = MushroomToyInteractions.handle(yorkie, player, stack);
		if (handled != null) {
			return handled;
		}

		return MushroomOwnerCommandInteractions.handle(yorkie, player, stack);
	}
}
