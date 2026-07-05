package dev.alicon.mushroomyorkie.item;

import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.level.Level;

final class YorkieBallItem extends Item {
	YorkieBallItem(Properties properties) {
		super(properties);
	}

	@Override
	public InteractionResult use(Level level, Player player, InteractionHand hand) {
		YorkieBallThrower.throwBall(level, player, hand);
		return InteractionResult.SUCCESS;
	}
}
