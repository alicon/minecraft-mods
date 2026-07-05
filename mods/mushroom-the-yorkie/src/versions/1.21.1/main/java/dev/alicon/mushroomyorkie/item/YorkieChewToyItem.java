package dev.alicon.mushroomyorkie.item;

import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResultHolder;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;

final class YorkieChewToyItem extends Item {
	YorkieChewToyItem(Properties properties) {
		super(properties);
	}

	@Override
	public InteractionResultHolder<ItemStack> use(Level level, Player player, InteractionHand hand) {
		ItemStack stack = YorkieBallThrower.throwBall(level, player, hand);
		return InteractionResultHolder.sidedSuccess(stack, level.isClientSide());
	}
}
