package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.MushroomTheYorkie;
import dev.alicon.mushroomyorkie.item.ModItems;
import net.minecraft.core.particles.ParticleTypes;
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

		if (MushroomFoodPolicy.isYorkieTreat(stack)) {
			if (!yorkie.level().isClientSide()) {
				if (!yorkie.isTame()) {
					if (MushroomTheYorkie.oneMushroomPerPlayer() && hasOtherLoadedMushroomOwnedBy((ServerLevel) yorkie.level(), player, yorkie)) {
						player.displayClientMessage(Component.translatable("message.mushroom_yorkie.one_only"), true);
						MushroomBehaviorDebugger.debug(yorkie, "claim_blocked", "claim blocked: player already has a loaded Mushroom", true);
						return InteractionResult.SUCCESS;
					}

					yorkie.claimFor(player);
					yorkie.level().broadcastEntityEvent(yorkie, (byte) 7);
					player.displayClientMessage(Component.translatable("message.mushroom_yorkie.tamed"), true);
					MushroomBehaviorDebugger.debug(yorkie, "tamed", "tamed: claimed by " + player.getName().getString(), true);
				}

				yorkie.feedTreat(player, hand, stack);
				MushroomFoodStatus.show(player, yorkie);
				MushroomBehaviorDebugger.debug(yorkie, "fed_treat", "fed treat: needs refreshed and peaceful barking muted", true);
			}

			return InteractionResult.SUCCESS;
		}

		if (MushroomFoodPolicy.isPlayerFood(stack) && yorkie.isTame() && yorkie.isOwnedBy(player)) {
			if (!yorkie.level().isClientSide()) {
				int nutrition = MushroomFoodPolicy.nutrition(stack);
				boolean calmingFood = MushroomFoodPolicy.calmsPeacefulMobBarking(stack);
				yorkie.useInteractionItem(player, hand, stack);
				yorkie.needs.eatPlayerFood(nutrition);
				yorkie.heal(Math.max(1.0F, Math.min(4.0F, nutrition * 0.5F)));
				yorkie.playFoodSound();
				if (yorkie.level() instanceof ServerLevel level) {
					if (calmingFood) {
						yorkie.mutePeacefulMobBarking(level);
					}
					level.sendParticles(ParticleTypes.HEART, yorkie.getX(), yorkie.getY() + 0.5D, yorkie.getZ(), 2, 0.2D, 0.15D, 0.2D, 0.0D);
				}
				MushroomFoodStatus.show(player, yorkie);
				MushroomBehaviorDebugger.debug(yorkie, "fed_player_food", "fed food: nutrition=" + nutrition + ", calming=" + calmingFood, true);
			}

			return InteractionResult.SUCCESS;
		}

		if (stack.is(ModItems.YORKIE_HARNESS) && yorkie.isTame() && yorkie.isOwnedBy(player)) {
			if (!yorkie.level().isClientSide()) {
				if (yorkie.hasHarness()) {
					yorkie.setHarness(false);
					ItemStack removedHarness = new ItemStack(ModItems.YORKIE_HARNESS);
					if (!player.addItem(removedHarness)) {
						player.drop(removedHarness, false);
					}
					yorkie.playSound(SoundEvents.ARMOR_EQUIP_LEATHER.value(), 0.45F, 0.85F);
					player.displayClientMessage(Component.translatable("message.mushroom_yorkie.harness_off"), true);
					MushroomBehaviorDebugger.debug(yorkie, "harness_off", "harness: removed", true);
				} else {
					yorkie.setHarness(true);
					yorkie.useInteractionItem(player, hand, stack);
					yorkie.playSound(SoundEvents.ARMOR_EQUIP_LEATHER.value(), 0.45F, 1.35F);
					player.displayClientMessage(Component.translatable("message.mushroom_yorkie.harness_on"), true);
					MushroomBehaviorDebugger.debug(yorkie, "harness_on", "harness: equipped", true);
				}
			}

			return InteractionResult.SUCCESS;
		}

		if ((stack.is(ModItems.YORKIE_BALL) || stack.is(ModItems.YORKIE_CHEW_TOY)) && yorkie.isTame() && yorkie.isOwnedBy(player)) {
			if (!yorkie.level().isClientSide()) {
				yorkie.needs.playWithToy();
				yorkie.bark();
				yorkie.setDeltaMovement(yorkie.getDeltaMovement().add(0.0D, 0.18D, 0.0D));
				yorkie.playSound(SoundEvents.WOOL_HIT, 0.45F, 1.4F);
				if (yorkie.level() instanceof ServerLevel level) {
					level.sendParticles(ParticleTypes.HEART, yorkie.getX(), yorkie.getY() + 0.5D, yorkie.getZ(), 3, 0.25D, 0.2D, 0.25D, 0.0D);
				}
				player.displayClientMessage(Component.translatable("message.mushroom_yorkie.toy_play"), true);
				MushroomBehaviorDebugger.debug(yorkie, "toy_play", "toy: played with " + stack.getHoverName().getString(), true);
			}

			return InteractionResult.SUCCESS;
		}

		if (stack.is(net.minecraft.world.item.Items.LEAD) && !yorkie.hasHarness()) {
			if (!yorkie.level().isClientSide()) {
				player.displayClientMessage(Component.translatable("message.mushroom_yorkie.needs_harness"), true);
				MushroomBehaviorDebugger.debug(yorkie, "lead_blocked", "lead blocked: Mushroom needs his harness first", true);
			}

			return InteractionResult.SUCCESS;
		}

		if (yorkie.isTame() && yorkie.isOwnedBy(player) && stack.isEmpty()) {
			if (!yorkie.level().isClientSide()) {
				if (yorkie.isPassenger()) {
					yorkie.stopRiding();
					yorkie.bark();
					player.displayClientMessage(Component.translatable("message.mushroom_yorkie.dismounted"), true);
					MushroomBehaviorDebugger.debug(yorkie, "vehicle_dismount", "vehicle: owner helped Mushroom hop out", true);
					return InteractionResult.SUCCESS;
				}

				if (yorkie.isMushroomSleeping()) {
					boolean woke = yorkie.handleSleepingInteract(player);
					MushroomBehaviorDebugger.debug(
							yorkie,
							woke ? "sleep_wake" : "sleep_interact",
							woke ? "sleep interact: double-click woke Mushroom" : "sleep interact: first poke while sleeping",
							true
					);
					return InteractionResult.SUCCESS;
				}

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
