package dev.alicon.copsrobbers.item;

import static dev.alicon.copsrobbers.item.KitStructurePlacement.fill;
import static dev.alicon.copsrobbers.item.KitStructurePlacement.placeFloorButton;
import static dev.alicon.copsrobbers.item.KitStructurePlacement.placeIronDoor;
import static dev.alicon.copsrobbers.item.KitStructurePlacement.placePressurePlate;
import static dev.alicon.copsrobbers.item.KitStructurePlacement.placeWallSign;
import static dev.alicon.copsrobbers.item.KitStructurePlacement.set;

import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.context.UseOnContext;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;

/** Places a small police station with a jail cell and truck garage. */
public final class PoliceStationKitItem extends Item {
	/** Registry constructor; generated jail/drop-off layout must stay aligned with robber release logic. */
	public PoliceStationKitItem(Properties properties) {
		super(properties);
	}

	@Override
	public InteractionResult useOn(UseOnContext context) {
		Level level = context.getLevel();
		BlockPos origin = context.getClickedPos().relative(context.getClickedFace());
		Direction front = context.getHorizontalDirection().getOpposite();
		if (!level.isClientSide()) {
			buildStation(level, origin, front);
			if (context.getPlayer() != null && !context.getPlayer().hasInfiniteMaterials()) {
				context.getItemInHand().shrink(1);
			}
		}
		return InteractionResult.SUCCESS;
	}

	private static void buildStation(Level level, BlockPos origin, Direction front) {
		Direction right = front.getClockWise();
		fill(level, origin, front, right, -8, 0, -4, 8, 0, 13, Blocks.SMOOTH_STONE);
		fill(level, origin, front, right, -8, 1, 13, 8, 4, 13, Blocks.QUARTZ_BLOCK);
		fill(level, origin, front, right, -8, 1, -4, -8, 4, 13, Blocks.QUARTZ_BLOCK);
		fill(level, origin, front, right, 8, 1, -4, 8, 4, 13, Blocks.QUARTZ_BLOCK);
		fill(level, origin, front, right, -8, 4, -4, 8, 4, 13, Blocks.SMOOTH_QUARTZ);
		fill(level, origin, front, right, -8, 1, -4, -3, 3, -4, Blocks.QUARTZ_BLOCK);
		fill(level, origin, front, right, 3, 1, -4, 8, 3, -4, Blocks.QUARTZ_BLOCK);
		fill(level, origin, front, right, -2, 3, -4, 2, 3, -4, Blocks.QUARTZ_BLOCK);
		fill(level, origin, front, right, -7, 2, -4, -5, 2, -4, Blocks.GLASS_PANE);
		fill(level, origin, front, right, 5, 2, -4, 7, 2, -4, Blocks.GLASS_PANE);
		fill(level, origin, front, right, -2, 1, -4, -1, 2, -4, Blocks.GLASS);
		fill(level, origin, front, right, 1, 1, -4, 2, 2, -4, Blocks.GLASS);
		fill(level, origin, front, right, 8, 2, 0, 8, 2, 3, Blocks.GLASS_PANE);
		fill(level, origin, front, right, -7, 1, -3, 7, 3, 12, Blocks.AIR);
		set(level, origin, front, right, 0, 0, -5, Blocks.SMOOTH_STONE.defaultBlockState());
		placeIronDoor(level, origin, front, right, 0, 1, -4, front);
		placePressurePlate(level, origin, front, right, 0, 1, -5);
		placePressurePlate(level, origin, front, right, 0, 1, -3);
		placeWallSign(level, origin, front, right, 0, 4, -5, front.getOpposite(), "Police", "Station");

		// Garage and prisoner drop-off lane on the right.
		fill(level, origin, front, right, 3, 0, -3, 7, 0, 12, Blocks.LIGHT_GRAY_CONCRETE);
		fill(level, origin, front, right, 3, 1, -4, 7, 3, -4, Blocks.QUARTZ_BLOCK);
		fill(level, origin, front, right, 3, 2, -4, 4, 2, -4, Blocks.GLASS);
		fill(level, origin, front, right, 6, 2, -4, 7, 2, -4, Blocks.GLASS);
		set(level, origin, front, right, 5, 0, -5, Blocks.SMOOTH_STONE.defaultBlockState());
		placeIronDoor(level, origin, front, right, 5, 1, -4, front);
		placePressurePlate(level, origin, front, right, 5, 1, -5);
		placePressurePlate(level, origin, front, right, 5, 1, -3);
		fill(level, origin, front, right, -4, -1, 14, 4, -1, 20, Blocks.LIGHT_GRAY_CONCRETE);
		fill(level, origin, front, right, -1, -1, 15, 1, -1, 19, Blocks.YELLOW_CONCRETE);

		// Larger jail cell on the left.
		fill(level, origin, front, right, -7, 1, 3, -2, 3, 10, Blocks.AIR);
		fill(level, origin, front, right, -7, 1, 2, -2, 3, 2, Blocks.IRON_BARS);
		fill(level, origin, front, right, -7, 1, 11, -2, 3, 11, Blocks.IRON_BARS);
		fill(level, origin, front, right, -7, 1, 3, -7, 3, 10, Blocks.IRON_BARS);
		fill(level, origin, front, right, -2, 1, 3, -2, 3, 10, Blocks.IRON_BARS);
		fill(level, origin, front, right, -2, 1, 6, -2, 2, 6, Blocks.AIR);
		placeIronDoor(level, origin, front, right, -2, 1, 6, right);
		placeFloorButton(level, origin, front, right, -1, 1, 6, right);
		placeFloorButton(level, origin, front, right, -3, 1, 6, right.getOpposite());

		// Fluorescent-style ceiling strips.
		fill(level, origin, front, right, -6, 4, -1, -3, 4, -1, Blocks.SEA_LANTERN);
		fill(level, origin, front, right, -6, 4, 7, -3, 4, 7, Blocks.SEA_LANTERN);
		fill(level, origin, front, right, 2, 4, 1, 6, 4, 1, Blocks.SEA_LANTERN);
		fill(level, origin, front, right, 2, 4, 7, 6, 4, 7, Blocks.SEA_LANTERN);

		// Back prisoner drop-off entrance.
		fill(level, origin, front, right, 0, 1, 13, 0, 2, 13, Blocks.AIR);
		set(level, origin, front, right, 0, 0, 14, Blocks.SMOOTH_STONE.defaultBlockState());
		placeIronDoor(level, origin, front, right, 0, 1, 13, front);
		placePressurePlate(level, origin, front, right, 0, 1, 14);
		placePressurePlate(level, origin, front, right, 0, 1, 12);
		placeWallSign(level, origin, front, right, 0, 3, 14, front, "Prisoner", "Drop Off");

		// Police colors.
		set(level, origin, front, right, -1, 5, -4, Blocks.BLUE_CONCRETE.defaultBlockState());
		set(level, origin, front, right, 0, 5, -4, Blocks.WHITE_CONCRETE.defaultBlockState());
		set(level, origin, front, right, 1, 5, -4, Blocks.RED_CONCRETE.defaultBlockState());
	}

	/** Places a police station structure at the supplied origin. */
	public static void placeStation(Level level, BlockPos origin, Direction front) {
		buildStation(level, origin, front);
	}
}
