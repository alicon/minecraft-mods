package dev.alicon.mushroomyorkie.item;

import dev.alicon.mushroomyorkie.entity.MushroomFieldGuide;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.level.Level;

final class FieldGuideItem extends Item {
	FieldGuideItem(Properties properties) {
		super(properties);
	}

	@Override
	public InteractionResult use(Level level, Player player, InteractionHand hand) {
		if (!level.isClientSide()) {
			MushroomFieldGuide.use(player);
		}
		return InteractionResult.SUCCESS;
	}
}
