package dev.alicon.mushroomyorkie.item;

import net.fabricmc.fabric.api.event.player.UseItemCallback;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.item.Items;

final class YorkieToyThrowHandler {
	private static boolean registered;

	private YorkieToyThrowHandler() {
	}

	static void register() {
		if (registered) {
			return;
		}
		registered = true;
		UseItemCallback.EVENT.register((player, level, hand) -> {
			if (player.isSpectator() || !player.getItemInHand(hand).is(Items.BONE)) {
				return InteractionResult.PASS;
			}

			YorkieBallThrower.throwBall(level, player, hand);
			return InteractionResult.SUCCESS;
		});
	}
}
