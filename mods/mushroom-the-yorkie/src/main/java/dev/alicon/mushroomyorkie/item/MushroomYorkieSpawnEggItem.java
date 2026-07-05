package dev.alicon.mushroomyorkie.item;

import dev.alicon.mushroomyorkie.MushroomTheYorkie;
import dev.alicon.mushroomyorkie.entity.ModEntities;
import dev.alicon.mushroomyorkie.entity.MushroomYorkieEntity;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.SpawnEggItem;
import net.minecraft.world.item.context.UseOnContext;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.entity.EntityTypeTest;

final class MushroomYorkieSpawnEggItem extends SpawnEggItem {
	private static final double NEARBY_UNOWNED_MUSHROOM_RADIUS_SQ = 64.0D * 64.0D;

	MushroomYorkieSpawnEggItem(Item.Properties properties) {
		super(properties);
	}

	@Override
	public InteractionResult useOn(UseOnContext context) {
		Level level = context.getLevel();
		Player player = context.getPlayer();
		if (this.ownerAlreadyHasMushroom(level, player)) {
			return InteractionResult.FAIL;
		}

		if (!(level instanceof ServerLevel serverLevel) || player == null) {
			return InteractionResult.SUCCESS;
		}

		BlockPos spawnPos = context.getClickedPos().relative(context.getClickedFace());
		MushroomYorkieEntity yorkie = ModEntities.MUSHROOM_YORKIE.spawn(
				serverLevel,
				entity -> {
					entity.claimFor(player);
					entity.setCustomName(Component.literal("Mushroom"));
				},
				spawnPos,
				EntitySpawnReason.SPAWN_ITEM_USE,
				true,
				false
		);
		if (yorkie == null) {
			return InteractionResult.FAIL;
		}

		if (!player.isCreative()) {
			context.getItemInHand().shrink(1);
		}

		return InteractionResult.SUCCESS;
	}

	@Override
	public InteractionResult use(Level level, Player player, InteractionHand hand) {
		if (this.ownerAlreadyHasMushroom(level, player)) {
			return InteractionResult.FAIL;
		}

		return super.use(level, player, hand);
	}

	private boolean ownerAlreadyHasMushroom(Level level, Player player) {
		if (!MushroomTheYorkie.oneMushroomPerPlayer() || player == null || !(level instanceof ServerLevel serverLevel)) {
			return false;
		}

		if (!loadedMushroomBlocksSpawn(serverLevel, player)) {
			return false;
		}

		player.displayClientMessage(Component.translatable("message.mushroom_yorkie.one_only"), true);
		return true;
	}

	private static boolean loadedMushroomBlocksSpawn(ServerLevel level, Player player) {
		return !level.getEntities(
				EntityTypeTest.forClass(MushroomYorkieEntity.class),
				yorkie -> yorkie.isAlive() && (yorkie.belongsTo(player) || (!yorkie.isTame() && yorkie.distanceToSqr(player) <= NEARBY_UNOWNED_MUSHROOM_RADIUS_SQ))
		).isEmpty();
	}
}
