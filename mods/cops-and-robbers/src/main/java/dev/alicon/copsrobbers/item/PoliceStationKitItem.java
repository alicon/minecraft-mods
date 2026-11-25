package dev.alicon.copsrobbers.item;

import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;

/** Places a small police station with a jail cell and truck garage. */
public final class PoliceStationKitItem extends StructureKitItem {
	/** Registry constructor; generated jail/drop-off layout must stay aligned with robber release logic. */
	public PoliceStationKitItem(Properties properties) {
		super(properties);
	}

	@Override
	void place(Level level, BlockPos origin, Direction front) {
		placeStation(level, origin, front);
	}

	/** Places a police station structure at the supplied origin. */
	public static void placeStation(Level level, BlockPos origin, Direction front) {
		Direction right = front.getClockWise();
		KitStructurePlacement structure = new KitStructurePlacement(level, origin, front);
		structure.fill(-8, 0, -4, 8, 0, 13, Blocks.SMOOTH_STONE);
		structure.fill(-8, 1, 13, 8, 4, 13, Blocks.QUARTZ_BLOCK);
		structure.fill(-8, 1, -4, -8, 4, 13, Blocks.QUARTZ_BLOCK);
		structure.fill(8, 1, -4, 8, 4, 13, Blocks.QUARTZ_BLOCK);
		structure.fill(-8, 4, -4, 8, 4, 13, Blocks.SMOOTH_QUARTZ);
		structure.fill(-8, 1, -4, -3, 3, -4, Blocks.QUARTZ_BLOCK);
		structure.fill(3, 1, -4, 8, 3, -4, Blocks.QUARTZ_BLOCK);
		structure.fill(-2, 3, -4, 2, 3, -4, Blocks.QUARTZ_BLOCK);
		structure.fill(-7, 2, -4, -5, 2, -4, Blocks.GLASS_PANE);
		structure.fill(5, 2, -4, 7, 2, -4, Blocks.GLASS_PANE);
		structure.fill(-2, 1, -4, -1, 2, -4, Blocks.GLASS);
		structure.fill(1, 1, -4, 2, 2, -4, Blocks.GLASS);
		structure.fill(8, 2, 0, 8, 2, 3, Blocks.GLASS_PANE);
		structure.fill(-7, 1, -3, 7, 3, 12, Blocks.AIR);
		structure.set(0, 0, -5, Blocks.SMOOTH_STONE.defaultBlockState());
		structure.placeIronDoor(0, 1, -4, front);
		structure.placePressurePlate(0, 1, -5);
		structure.placePressurePlate(0, 1, -3);

		// Flush drive-through bay on the right, clear for the cruiser collision box.
		structure.fill(3, 0, -9, 7, 0, 12, Blocks.LIGHT_GRAY_CONCRETE);
		structure.fill(3, 1, -4, 7, 3, -4, Blocks.AIR);
		structure.set(3, 0, -7, Blocks.YELLOW_CONCRETE.defaultBlockState());
		structure.set(7, 0, -7, Blocks.YELLOW_CONCRETE.defaultBlockState());
		structure.fill(-4, -1, 14, 4, -1, 20, Blocks.LIGHT_GRAY_CONCRETE);
		structure.fill(-1, -1, 15, 1, -1, 19, Blocks.YELLOW_CONCRETE);

		// Larger jail cell on the left.
		structure.fill(-7, 1, 3, -2, 3, 10, Blocks.AIR);
		structure.fill(-7, 1, 2, -2, 3, 2, Blocks.IRON_BARS);
		structure.fill(-7, 1, 11, -2, 3, 11, Blocks.IRON_BARS);
		structure.fill(-7, 1, 3, -7, 3, 10, Blocks.IRON_BARS);
		structure.fill(-2, 1, 3, -2, 3, 10, Blocks.IRON_BARS);
		structure.fill(-2, 1, 6, -2, 2, 6, Blocks.AIR);
		structure.placeIronDoor(-2, 1, 6, right);
		structure.placeFloorButton(-1, 1, 6, right);
		structure.placeFloorButton(-3, 1, 6, right.getOpposite());

		// Fluorescent-style ceiling strips.
		structure.fill(-6, 4, -1, -3, 4, -1, Blocks.SEA_LANTERN);
		structure.fill(-6, 4, 7, -3, 4, 7, Blocks.SEA_LANTERN);
		structure.fill(2, 4, 1, 6, 4, 1, Blocks.SEA_LANTERN);
		structure.fill(2, 4, 7, 6, 4, 7, Blocks.SEA_LANTERN);

		// Back prisoner drop-off entrance.
		structure.fill(0, 1, 13, 0, 2, 13, Blocks.AIR);
		structure.set(0, 0, 14, Blocks.SMOOTH_STONE.defaultBlockState());
		structure.placeIronDoor(0, 1, 13, front);
		structure.placePressurePlate(0, 1, 14);
		structure.placePressurePlate(0, 1, 12);
		structure.placeWallSign(0, 3, 14, front, "Prisoner", "Drop Off");

		// Blue awning, roof lights and columns frame the lobby and the open bay.
		structure.fill(-8, 4, -5, 8, 4, -5, Blocks.BLUE_CONCRETE);
		structure.fill(-8, 5, -4, 8, 5, -4, Blocks.POLISHED_ANDESITE);
		structure.fill(-8, 1, -4, -8, 3, -4, Blocks.BLUE_CONCRETE);
		structure.fill(8, 1, -4, 8, 3, -4, Blocks.BLUE_CONCRETE);
		structure.placeWallSign(0, 4, -6, front.getOpposite(), "PATROL", "HEADQUARTERS");
		structure.placeWallSign(5, 4, -6, front.getOpposite(), "CRUISER", "BAY");
		structure.set(-1, 5, -4, Blocks.BLUE_CONCRETE.defaultBlockState());
		structure.set(0, 5, -4, Blocks.WHITE_CONCRETE.defaultBlockState());
		structure.set(1, 5, -4, Blocks.BLUE_CONCRETE.defaultBlockState());
	}
}
