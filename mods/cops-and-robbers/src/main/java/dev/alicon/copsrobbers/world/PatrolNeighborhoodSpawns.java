package dev.alicon.copsrobbers.world;

import dev.alicon.copsrobbers.entity.BankRobberEntity;
import dev.alicon.copsrobbers.entity.CopEntity;
import dev.alicon.copsrobbers.entity.FireTruckEntity;
import dev.alicon.copsrobbers.entity.FiremanEntity;
import dev.alicon.copsrobbers.entity.ModEntities;
import dev.alicon.copsrobbers.entity.PoliceCruiserEntity;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.EntitySpawnReason;

final class PatrolNeighborhoodSpawns {
	private PatrolNeighborhoodSpawns() {
	}

	static void spawnRobbers(ServerLevel level, BlockPos anchor) {
		for (int i = 0; i < 14; i++) {
			int x = level.random.nextInt(121) - 60;
			int z = level.random.nextInt(81) - 40;
			BlockPos pos = PatrolNeighborhoodSite.surface(level, anchor.offset(x, 0, z)).above();
			BankRobberEntity robber = ModEntities.BANK_ROBBER.create(level, EntitySpawnReason.EVENT);
			if (robber != null) {
				robber.snapTo(pos, level.random.nextFloat() * 360.0F, 0.0F);
				level.addFreshEntity(robber);
			}
		}
	}

	static void spawnCops(ServerLevel level, BlockPos station, Direction front) {
		for (int i = 0; i < 3; i++) {
			CopEntity cop = ModEntities.COP.create(level, EntitySpawnReason.EVENT);
			if (cop != null) {
				BlockPos pos = station.relative(front, 4 + i * 2).relative(front.getClockWise(), i - 1).above();
				cop.snapTo(pos, front.toYRot(), 0.0F);
				level.addFreshEntity(cop);
			}
		}
	}

	static void spawnFireCrew(ServerLevel level, BlockPos station, Direction front) {
		for (int i = 0; i < 3; i++) {
			FiremanEntity fireman = ModEntities.FIREMAN.create(level, EntitySpawnReason.EVENT);
			if (fireman != null) {
				BlockPos pos = station.offset(-4 + i * 4, 2, 2);
				fireman.snapTo(pos, front.toYRot(), 0.0F);
				level.addFreshEntity(fireman);
			}
		}
		FireTruckEntity truck = ModEntities.FIRE_TRUCK.create(level, EntitySpawnReason.EVENT);
		if (truck != null) {
			truck.snapTo(station.offset(0, 2, -8), front.toYRot(), 0.0F);
			level.addFreshEntity(truck);
		}
	}

	static void spawnCruiser(ServerLevel level, BlockPos pos, Direction front) {
		PoliceCruiserEntity cruiser = ModEntities.POLICE_CRUISER.create(level, EntitySpawnReason.EVENT);
		if (cruiser != null) {
			cruiser.snapTo(pos, front.toYRot(), 0.0F);
			level.addFreshEntity(cruiser);
		}
	}

	static BlockPos cruiserParkingSpot(ServerLevel level, BlockPos station, Direction front) {
		return PatrolNeighborhoodSite.surface(level, station.relative(front.getOpposite(), 11).relative(front.getCounterClockWise(), 5)).above();
	}
}
