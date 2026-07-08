package dev.alicon.mushroomyorkie.entity;

import net.minecraft.network.chat.Component;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;

final class MushroomOwnerCommandInteractions {
	private MushroomOwnerCommandInteractions() {
	}

	static InteractionResult handle(MushroomYorkieEntity yorkie, Player player, ItemStack stack) {
		if (!yorkie.isTame() || !yorkie.isOwnedBy(player) || !stack.isEmpty()) {
			return null;
		}

		if (!yorkie.level().isClientSide()) {
			handleServerCommand(yorkie, player);
		}

		return InteractionResult.SUCCESS;
	}

	private static void handleServerCommand(MushroomYorkieEntity yorkie, Player player) {
		if (yorkie.isPassenger()) {
			yorkie.stopRiding();
			MushroomYorkieSounds.bark(yorkie);
			player.displayClientMessage(Component.translatable("message.mushroom_yorkie.dismounted"), true);
			MushroomBehaviorDebugger.debug(yorkie, "vehicle_dismount", "vehicle: owner helped Mushroom hop out", true);
			return;
		}

		if (yorkie.isMushroomSleeping()) {
			boolean woke = yorkie.handleSleepingInteract(player);
			MushroomBehaviorDebugger.debug(
					yorkie,
					woke ? "sleep_wake" : "sleep_interact",
					woke ? "sleep interact: double-click woke Mushroom" : "sleep interact: first poke while sleeping",
					true
			);
			return;
		}

		if (player.isSecondaryUseActive() && yorkie.hasHarness()) {
			MushroomHarnessInteractions.removeHarness(yorkie, player);
			return;
		}

		if (!yorkie.isOrderedToSit() && MushroomYorkieStateQueries.isWetForSitting(yorkie)) {
			player.displayClientMessage(Component.translatable("message.mushroom_yorkie.sit_water"), true);
			MushroomBehaviorDebugger.debug(yorkie, "sit_blocked_water", "ordered: sit blocked while Mushroom is in water", true);
			return;
		}

		toggleSit(yorkie, player);
	}

	private static void toggleSit(MushroomYorkieEntity yorkie, Player player) {
		yorkie.setMushroomOrderedToSit(!yorkie.isOrderedToSit());
		MushroomBehaviorDebugger.debug(
				yorkie,
				yorkie.isOrderedToSit() ? "ordered_sit" : "ordered_follow",
				yorkie.isOrderedToSit() ? "ordered: sit" : "ordered: follow",
				true
		);
		player.displayClientMessage(
				Component.empty()
						.append(Component.translatable(yorkie.isOrderedToSit()
								? "message.mushroom_yorkie.sit"
								: "message.mushroom_yorkie.follow"))
						.append(" ")
						.append(MushroomFoodStatus.inline(yorkie)),
				true
		);
	}
}
