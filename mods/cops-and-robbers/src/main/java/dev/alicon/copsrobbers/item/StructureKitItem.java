package dev.alicon.copsrobbers.item;

import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.context.UseOnContext;
import net.minecraft.world.level.Level;

/** Places each kit on the server before consuming its item in survival. */
abstract class StructureKitItem extends Item {
	StructureKitItem(Properties properties) {
		super(properties);
	}

	@Override
	public final InteractionResult useOn(UseOnContext context) {
		Level level = context.getLevel();
		if (!level.isClientSide()) {
			BlockPos origin = context.getClickedPos().relative(context.getClickedFace());
			Direction front = context.getHorizontalDirection().getOpposite();
			this.place(level, origin, front);
			Player player = context.getPlayer();
			if (player != null && !player.hasInfiniteMaterials()) {
				context.getItemInHand().shrink(1);
			}
		}
		return InteractionResult.SUCCESS;
	}

	abstract void place(Level level, BlockPos origin, Direction front);
}
