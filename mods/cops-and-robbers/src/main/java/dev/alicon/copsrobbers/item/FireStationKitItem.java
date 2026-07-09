package dev.alicon.copsrobbers.item;

import static dev.alicon.copsrobbers.item.KitStructurePlacement.fill;
import static dev.alicon.copsrobbers.item.KitStructurePlacement.placeIronDoor;
import static dev.alicon.copsrobbers.item.KitStructurePlacement.placePressurePlate;
import static dev.alicon.copsrobbers.item.KitStructurePlacement.placeWallSign;
import static dev.alicon.copsrobbers.item.KitStructurePlacement.set;

import dev.alicon.copsrobbers.entity.FireTruckEntity;
import dev.alicon.copsrobbers.entity.FiremanEntity;
import dev.alicon.copsrobbers.entity.ModEntities;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.context.UseOnContext;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;

/** Places a compact fire station with a front bay and responder crew. */
public final class FireStationKitItem extends Item {
	/** Registry constructor; fire station geometry mirrors starter-neighborhood generation. */
	public FireStationKitItem(Properties properties) {
		super(properties);
	}

	@Override
	public InteractionResult useOn(UseOnContext context) {
		Level level = context.getLevel();
		BlockPos origin = context.getClickedPos().relative(context.getClickedFace());
		Direction front = context.getHorizontalDirection().getOpposite();
		if (!level.isClientSide()) {
			placeFireStation(level, origin, front);
			if (level instanceof ServerLevel serverLevel) {
				spawnFireCrew(serverLevel, origin, front);
			}
			if (context.getPlayer() != null && !context.getPlayer().hasInfiniteMaterials()) {
				context.getItemInHand().shrink(1);
			}
		}
		return InteractionResult.SUCCESS;
	}

	/** Places a fire station structure at the supplied origin. */
	public static void placeFireStation(Level level, BlockPos origin, Direction front) {
		Direction right = front.getClockWise();
		fill(level, origin, front, right, -8, 1, -5, 8, 1, 10, Blocks.SMOOTH_STONE);
		fill(level, origin, front, right, -8, 2, -5, 8, 4, -5, Blocks.RED_CONCRETE);
		fill(level, origin, front, right, -8, 2, 10, 8, 4, 10, Blocks.RED_CONCRETE);
		fill(level, origin, front, right, -8, 2, -5, -8, 4, 10, Blocks.RED_CONCRETE);
		fill(level, origin, front, right, 8, 2, -5, 8, 4, 10, Blocks.RED_CONCRETE);
		fill(level, origin, front, right, -8, 5, -5, 8, 5, 10, Blocks.SMOOTH_QUARTZ);
		fill(level, origin, front, right, -7, 2, -4, 7, 4, 9, Blocks.AIR);
		fill(level, origin, front, right, -4, 2, -5, 4, 4, -5, Blocks.GLASS_PANE);
		fill(level, origin, front, right, -1, 2, -5, 1, 4, -5, Blocks.WHITE_CONCRETE);
		set(level, origin, front, right, 0, 1, -6, Blocks.SMOOTH_STONE.defaultBlockState());
		placeIronDoor(level, origin, front, right, 0, 2, -5, front);
		placePressurePlate(level, origin, front, right, 0, 2, -6);
		placePressurePlate(level, origin, front, right, 0, 2, -4);
		fill(level, origin, front, right, -7, 3, -5, -5, 3, -5, Blocks.GLASS_PANE);
		fill(level, origin, front, right, 5, 3, -5, 7, 3, -5, Blocks.GLASS_PANE);
		fill(level, origin, front, right, -8, 3, 0, -8, 3, 3, Blocks.GLASS_PANE);
		fill(level, origin, front, right, 8, 3, 0, 8, 3, 3, Blocks.GLASS_PANE);
		fill(level, origin, front, right, -7, 2, 3, -5, 4, 8, Blocks.WHITE_WOOL);
		fill(level, origin, front, right, -5, 4, 0, -1, 4, 0, Blocks.SEA_LANTERN);
		fill(level, origin, front, right, 1, 4, 0, 5, 4, 0, Blocks.SEA_LANTERN);
		fill(level, origin, front, right, -5, 4, 6, -1, 4, 6, Blocks.SEA_LANTERN);
		fill(level, origin, front, right, 1, 4, 6, 5, 4, 6, Blocks.SEA_LANTERN);
		placeWallSign(level, origin, front, right, 0, 6, -6, front.getOpposite(), "Fire", "Station");
		set(level, origin, front, right, 0, 6, -5, Blocks.WHITE_CONCRETE.defaultBlockState());
		set(level, origin, front, right, -1, 6, -5, Blocks.RED_CONCRETE.defaultBlockState());
		set(level, origin, front, right, 1, 6, -5, Blocks.RED_CONCRETE.defaultBlockState());
	}

	private static void spawnFireCrew(ServerLevel level, BlockPos origin, Direction front) {
		Direction right = front.getClockWise();
		float outwardYaw = front.getOpposite().toYRot();
		for (int x : new int[] {-4, 0, 4}) {
			FiremanEntity fireman = ModEntities.FIREMAN.create(level, EntitySpawnReason.EVENT);
			if (fireman != null) {
				BlockPos pos = origin.relative(right, x).relative(front, 2).above(2);
				fireman.snapTo(pos.getX() + 0.5D, pos.getY(), pos.getZ() + 0.5D, outwardYaw, 0.0F);
				level.addFreshEntity(fireman);
			}
		}
		FireTruckEntity truck = ModEntities.FIRE_TRUCK.create(level, EntitySpawnReason.EVENT);
		if (truck != null) {
			BlockPos pos = origin.relative(front, -8).above(2);
			truck.snapTo(pos.getX() + 0.5D, pos.getY(), pos.getZ() + 0.5D, outwardYaw, 0.0F);
			level.addFreshEntity(truck);
		}
	}
}
