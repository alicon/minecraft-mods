package dev.alicon.mushroomyorkie.item;

import net.fabricmc.fabric.api.event.player.UseItemCallback;
import net.minecraft.world.InteractionResultHolder;
import net.minecraft.world.item.ItemStack;
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
			ItemStack stack = player.getItemInHand(hand);
			if (player.isSpectator() || !stack.is(Items.BONE)) {
				return InteractionResultHolder.pass(stack);
			}

			ItemStack result = YorkieBallThrower.throwBall(level, player, hand);
			return InteractionResultHolder.sidedSuccess(result, level.isClientSide());
		});
	}
}
