package dev.alicon.copsrobbers.item;

import dev.alicon.copsrobbers.entity.FireTruckEntity;
import dev.alicon.copsrobbers.entity.FiremanEntity;
import dev.alicon.copsrobbers.entity.ModEntities;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;

/** Places a compact fire station with a front bay and responder crew. */
public final class FireStationKitItem extends StructureKitItem {
	/** Registry constructor; fire station geometry mirrors starter-neighborhood generation. */
	public FireStationKitItem(Properties properties) {
		super(properties);
	}

	@Override
	void place(Level level, BlockPos origin, Direction front) {
		placeFireStation(level, origin, front);
		if (level instanceof ServerLevel serverLevel) {
			spawnFireCrew(serverLevel, origin, front);
		}
	}

	/** Places a fire station structure at the supplied origin. */
	public static void placeFireStation(Level level, BlockPos origin, Direction front) {
		KitStructurePlacement structure = new KitStructurePlacement(level, origin, front);
		structure.fill(-8, 1, -5, 8, 1, 10, Blocks.SMOOTH_STONE);
		structure.fill(-8, 2, -5, 8, 4, -5, Blocks.RED_CONCRETE);
		structure.fill(-8, 2, 10, 8, 4, 10, Blocks.RED_CONCRETE);
		structure.fill(-8, 2, -5, -8, 4, 10, Blocks.RED_CONCRETE);
		structure.fill(8, 2, -5, 8, 4, 10, Blocks.RED_CONCRETE);
		structure.fill(-8, 5, -5, 8, 5, 10, Blocks.SMOOTH_QUARTZ);
		structure.fill(-7, 2, -4, 7, 4, 9, Blocks.AIR);
		structure.fill(-4, 2, -5, 4, 4, -5, Blocks.GLASS_PANE);
		structure.fill(-1, 2, -5, 1, 4, -5, Blocks.WHITE_CONCRETE);
		structure.set(0, 1, -6, Blocks.SMOOTH_STONE.defaultBlockState());
		structure.placeIronDoor(0, 2, -5, front);
		structure.placePressurePlate(0, 2, -6);
		structure.placePressurePlate(0, 2, -4);
		structure.fill(-7, 3, -5, -5, 3, -5, Blocks.GLASS_PANE);
		structure.fill(5, 3, -5, 7, 3, -5, Blocks.GLASS_PANE);
		structure.fill(-8, 3, 0, -8, 3, 3, Blocks.GLASS_PANE);
		structure.fill(8, 3, 0, 8, 3, 3, Blocks.GLASS_PANE);
		structure.fill(-7, 2, 3, -5, 4, 8, Blocks.WHITE_WOOL);
		structure.fill(-5, 4, 0, -1, 4, 0, Blocks.SEA_LANTERN);
		structure.fill(1, 4, 0, 5, 4, 0, Blocks.SEA_LANTERN);
		structure.fill(-5, 4, 6, -1, 4, 6, Blocks.SEA_LANTERN);
		structure.fill(1, 4, 6, 5, 4, 6, Blocks.SEA_LANTERN);
		structure.placeWallSign(0, 6, -6, front.getOpposite(), "Fire", "Station");
		structure.set(0, 6, -5, Blocks.WHITE_CONCRETE.defaultBlockState());
		structure.set(-1, 6, -5, Blocks.RED_CONCRETE.defaultBlockState());
		structure.set(1, 6, -5, Blocks.RED_CONCRETE.defaultBlockState());
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
