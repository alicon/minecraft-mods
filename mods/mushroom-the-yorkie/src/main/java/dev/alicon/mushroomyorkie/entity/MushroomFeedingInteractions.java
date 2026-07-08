package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.MushroomTheYorkie;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.entity.EntityTypeTest;

final class MushroomFeedingInteractions {
	private MushroomFeedingInteractions() {
	}

	static InteractionResult handle(MushroomYorkieEntity yorkie, Player player, InteractionHand hand, ItemStack stack) {
		if (MushroomFoodPolicy.isYorkieTreat(stack)) {
			if (!yorkie.level().isClientSide()) {
				if (!claimUntamedYorkie(yorkie, player)) {
					return InteractionResult.SUCCESS;
				}

				feedTreat(yorkie, player, hand, stack);
				MushroomFoodStatus.show(player, yorkie);
				MushroomBehaviorDebugger.debug(yorkie, "fed_treat", "fed treat: needs refreshed and peaceful barking muted", true);
			}

			return InteractionResult.SUCCESS;
		}

		if (MushroomFoodPolicy.isPlayerFood(stack) && yorkie.isTame() && yorkie.isOwnedBy(player)) {
			if (!yorkie.level().isClientSide()) {
				feedPlayerFood(yorkie, player, hand, stack);
			}

			return InteractionResult.SUCCESS;
		}

		return null;
	}

	private static boolean claimUntamedYorkie(MushroomYorkieEntity yorkie, Player player) {
		if (yorkie.isTame()) {
			return true;
		}

		if (MushroomTheYorkie.oneMushroomPerPlayer()
				&& yorkie.level() instanceof ServerLevel level
				&& hasOtherLoadedMushroomOwnedBy(level, player, yorkie)) {
			player.displayClientMessage(Component.translatable("message.mushroom_yorkie.one_only"), true);
			MushroomBehaviorDebugger.debug(yorkie, "claim_blocked", "claim blocked: player already has a loaded Mushroom", true);
			return false;
		}

		yorkie.claimFor(player);
		yorkie.level().broadcastEntityEvent(yorkie, (byte) 7);
		player.displayClientMessage(Component.translatable("message.mushroom_yorkie.tamed"), true);
		MushroomBehaviorDebugger.debug(yorkie, "tamed", "tamed: claimed by " + player.getName().getString(), true);
		return true;
	}

	private static void feedTreat(MushroomYorkieEntity yorkie, Player player, InteractionHand hand, ItemStack stack) {
		yorkie.useInteractionItem(player, hand, stack);
		yorkie.needs.feedTreat();
		if (yorkie.level() instanceof ServerLevel level) {
			yorkie.mutePeacefulMobBarking(level);
		}
		yorkie.heal(3.0F);
		MushroomYorkieSounds.playTreatPickup(yorkie);
		MushroomYorkieSounds.playTreatTrick(yorkie);
	}

	private static void feedPlayerFood(MushroomYorkieEntity yorkie, Player player, InteractionHand hand, ItemStack stack) {
		int nutrition = MushroomFoodPolicy.nutrition(stack);
		boolean calmingFood = MushroomFoodPolicy.calmsPeacefulMobBarking(stack);
		yorkie.useInteractionItem(player, hand, stack);
		yorkie.needs.eatPlayerFood(nutrition);
		yorkie.heal(Math.max(1.0F, Math.min(4.0F, nutrition * 0.5F)));
		MushroomYorkieSounds.playFoodSound(yorkie);
		if (yorkie.level() instanceof ServerLevel level) {
			if (calmingFood) {
				yorkie.mutePeacefulMobBarking(level);
			}
			level.sendParticles(ParticleTypes.HEART, yorkie.getX(), yorkie.getY() + 0.5D, yorkie.getZ(), 2, 0.2D, 0.15D, 0.2D, 0.0D);
		}
		MushroomFoodStatus.show(player, yorkie);
		MushroomBehaviorDebugger.debug(yorkie, "fed_player_food", "fed food: nutrition=" + nutrition + ", calming=" + calmingFood, true);
	}

	private static boolean hasOtherLoadedMushroomOwnedBy(ServerLevel level, Player player, MushroomYorkieEntity ignoredYorkie) {
		return !level.getEntities(
				EntityTypeTest.forClass(MushroomYorkieEntity.class),
				yorkie -> yorkie != ignoredYorkie && yorkie.belongsTo(player)
		).isEmpty();
	}
}
