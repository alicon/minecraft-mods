package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.item.ModItems;
import net.minecraft.network.chat.Component;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

final class MushroomHarnessInteractions {
	private MushroomHarnessInteractions() {
	}

	static InteractionResult handle(MushroomYorkieEntity yorkie, Player player, InteractionHand hand, ItemStack stack) {
		if (stack.is(ModItems.YORKIE_HARNESS) && yorkie.isTame() && yorkie.isOwnedBy(player)) {
			if (!yorkie.level().isClientSide()) {
				if (yorkie.hasHarness()) {
					removeHarness(yorkie, player);
				} else {
					equipHarness(yorkie, player, hand, stack);
				}
			}

			return InteractionResult.SUCCESS;
		}

		if (stack.is(Items.LEAD) && !yorkie.hasHarness()) {
			if (!yorkie.level().isClientSide()) {
				player.displayClientMessage(Component.translatable("message.mushroom_yorkie.needs_harness"), true);
				MushroomBehaviorDebugger.debug(yorkie, "lead_blocked", "lead blocked: Mushroom needs his harness first", true);
			}

			return InteractionResult.SUCCESS;
		}

		return null;
	}

	static void removeHarness(MushroomYorkieEntity yorkie, Player player) {
		yorkie.setHarness(false);
		ItemStack removedHarness = new ItemStack(ModItems.YORKIE_HARNESS);
		if (!player.addItem(removedHarness)) {
			player.drop(removedHarness, false);
		}
		yorkie.playSound(SoundEvents.ARMOR_EQUIP_LEATHER.value(), 0.45F, 0.85F);
		player.displayClientMessage(Component.translatable("message.mushroom_yorkie.harness_off"), true);
		MushroomBehaviorDebugger.debug(yorkie, "harness_off", "harness: removed", true);
	}

	private static void equipHarness(MushroomYorkieEntity yorkie, Player player, InteractionHand hand, ItemStack stack) {
		yorkie.setHarness(true);
		yorkie.useInteractionItem(player, hand, stack);
		yorkie.playSound(SoundEvents.ARMOR_EQUIP_LEATHER.value(), 0.45F, 1.35F);
		player.displayClientMessage(Component.translatable("message.mushroom_yorkie.harness_on"), true);
		MushroomBehaviorDebugger.debug(yorkie, "harness_on", "harness: equipped", true);
	}
}
