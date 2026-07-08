package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.item.ModItems;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;

final class MushroomToyInteractions {
	private MushroomToyInteractions() {
	}

	static InteractionResult handle(MushroomYorkieEntity yorkie, Player player, ItemStack stack) {
		if (!isToy(stack) || !yorkie.isTame() || !yorkie.isOwnedBy(player)) {
			return null;
		}

		if (!yorkie.level().isClientSide()) {
			yorkie.needs.playWithToy();
			MushroomYorkieSounds.bark(yorkie);
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

	private static boolean isToy(ItemStack stack) {
		return stack.is(ModItems.YORKIE_BALL) || stack.is(ModItems.YORKIE_CHEW_TOY);
	}
}
