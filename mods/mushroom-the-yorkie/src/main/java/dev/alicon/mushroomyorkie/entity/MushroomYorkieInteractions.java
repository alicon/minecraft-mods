package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.MushroomTheYorkie;
import dev.alicon.mushroomyorkie.item.ModItems;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.entity.EntityTypeTest;

final class MushroomYorkieInteractions {
	private MushroomYorkieInteractions() {
	}

	static InteractionResult handle(MushroomYorkieEntity yorkie, Player player, InteractionHand hand) {
		ItemStack stack = player.getItemInHand(hand);

		if (yorkie.isFood(stack)) {
			if (!yorkie.level().isClientSide()) {
				if (!yorkie.isTame()) {
					if (MushroomTheYorkie.oneMushroomPerPlayer() && hasOtherLoadedMushroomOwnedBy((ServerLevel) yorkie.level(), player, yorkie)) {
						player.displayClientMessage(Component.translatable("message.mushroom_yorkie.one_only"), true);
						return InteractionResult.SUCCESS;
					}

					yorkie.claimFor(player);
					yorkie.level().broadcastEntityEvent(yorkie, (byte) 7);
					player.displayClientMessage(Component.translatable("message.mushroom_yorkie.tamed"), true);
				}

				yorkie.feedTreat(player, hand, stack);
			}

			return InteractionResult.SUCCESS;
		}

		if (stack.is(ModItems.YORKIE_HARNESS) && yorkie.isTame() && yorkie.isOwnedBy(player)) {
			if (!yorkie.level().isClientSide() && !yorkie.hasHarness()) {
				yorkie.setHarness(true);
				yorkie.useInteractionItem(player, hand, stack);
				yorkie.playSound(SoundEvents.ARMOR_EQUIP_LEATHER.value(), 0.45F, 1.35F);
				player.displayClientMessage(Component.translatable("message.mushroom_yorkie.harness_on"), true);
			}

			return InteractionResult.SUCCESS;
		}

		if (stack.is(net.minecraft.world.item.Items.LEAD) && !yorkie.hasHarness()) {
			if (!yorkie.level().isClientSide()) {
				player.displayClientMessage(Component.translatable("message.mushroom_yorkie.needs_harness"), true);
			}

			return InteractionResult.SUCCESS;
		}

		if (yorkie.isTame() && yorkie.isOwnedBy(player) && stack.isEmpty()) {
			if (!yorkie.level().isClientSide()) {
				if (yorkie.isMushroomSleeping()) {
					yorkie.handleSleepingInteract(player);
					return InteractionResult.SUCCESS;
				}

				yorkie.setMushroomOrderedToSit(!yorkie.isOrderedToSit());
				player.displayClientMessage(
						Component.translatable(yorkie.isOrderedToSit()
								? "message.mushroom_yorkie.sit"
								: "message.mushroom_yorkie.follow"),
						true
				);
			}

			return InteractionResult.SUCCESS;
		}

		return null;
	}

	private static boolean hasOtherLoadedMushroomOwnedBy(ServerLevel level, Player player, MushroomYorkieEntity ignoredYorkie) {
		return !level.getEntities(
				EntityTypeTest.forClass(MushroomYorkieEntity.class),
				yorkie -> yorkie != ignoredYorkie && yorkie.belongsTo(player)
		).isEmpty();
	}
}
