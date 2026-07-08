package dev.alicon.copsrobbers.world;

import dev.alicon.copsrobbers.entity.ModEntities;
import dev.alicon.copsrobbers.entity.PoliceCruiserEntity;
import dev.alicon.copsrobbers.item.BankKitItem;
import dev.alicon.copsrobbers.item.PoliceStationKitItem;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.storage.LevelData;
import net.minecraft.world.phys.AABB;

/** Builds a small kid-friendly police-and-robbers play area near fresh world spawn. */
public final class LongmontPatrolNeighborhood {
	private static final int AUTO_GENERATE_MAX_TICK = 600;
	private static final int CRUISER_CHECK_INTERVAL = 100;
	private static final Direction FRONT = Direction.EAST;
	private static final BlockPos[] STATION_OFFSETS = {
			new BlockPos(-28, 0, -12),
			new BlockPos(52, 0, 30)
	};
	private static final BlockPos[] BANK_OFFSETS = {
			new BlockPos(22, 0, -18),
			new BlockPos(-58, 0, 34),
			new BlockPos(84, 0, -26)
	};
	private static final BlockPos[] HIDEOUT_OFFSETS = {
			new BlockPos(-92, 0, -46),
			new BlockPos(108, 0, 44)
	};
	private static final BlockPos FIRE_STATION_OFFSET = new BlockPos(-4, 0, 58);

	private LongmontPatrolNeighborhood() {
	}

	/** Registers world tick behavior for starter-area generation and cruiser replacement. */
	public static void register() {
		ServerTickEvents.END_WORLD_TICK.register(LongmontPatrolNeighborhood::tick);
	}

	private static void tick(ServerLevel level) {
		if (level.dimension() != Level.OVERWORLD) {
			return;
		}

		PatrolNeighborhoodData data = level.getDataStorage().computeIfAbsent(PatrolNeighborhoodData.TYPE);
		if (!data.generated() && level.getGameTime() < AUTO_GENERATE_MAX_TICK) {
			generate(level, data);
		}
		if (data.generated() && level.getGameTime() % CRUISER_CHECK_INTERVAL == 0) {
			maintainCruiserNearSpawn(level, data.stationSpawn());
			maintainTellers(level, data.stationSpawn());
		}
	}

	private static void generate(ServerLevel level, PatrolNeighborhoodData data) {
		BlockPos anchor = PatrolNeighborhoodSite.surface(level, level.getRespawnData().pos());
		BlockPos firstStation = null;
		for (BlockPos offset : STATION_OFFSETS) {
			BlockPos station = PatrolNeighborhoodSite.clearPad(level, anchor.offset(offset), 16, 18);
			PoliceStationKitItem.placeStation(level, station, FRONT);
			PatrolNeighborhoodSpawns.spawnCops(level, station, FRONT);
			PatrolNeighborhoodSpawns.spawnCruiser(level, cruiserParkingSpot(level, station), FRONT);
			if (firstStation == null) {
				firstStation = station;
			}
		}

		for (BlockPos offset : BANK_OFFSETS) {
			BlockPos bank = PatrolNeighborhoodSite.clearPad(level, anchor.offset(offset), 15, 17);
			BankKitItem.placeBankWithTellers(level, bank, FRONT.getOpposite());
		}
		for (BlockPos offset : HIDEOUT_OFFSETS) {
			BlockPos hideout = PatrolNeighborhoodSite.clearPad(level, anchor.offset(offset), 11, 11);
			PatrolNeighborhoodStructures.buildHideout(level, hideout);
		}
		BlockPos fireStation = PatrolNeighborhoodSite.clearPad(level, anchor.offset(FIRE_STATION_OFFSET), 16, 16);
		PatrolNeighborhoodStructures.buildFireStation(level, fireStation);
		PatrolNeighborhoodSpawns.spawnFireCrew(level, fireStation, FRONT);

		PatrolNeighborhoodRoads.build(level, anchor, STATION_OFFSETS, BANK_OFFSETS, HIDEOUT_OFFSETS, FIRE_STATION_OFFSET);
		PatrolNeighborhoodSpawns.spawnRobbers(level, anchor);
		if (firstStation != null) {
			BlockPos spawn = firstStation.relative(FRONT.getOpposite(), 1).above(2);
			level.setRespawnData(LevelData.RespawnData.of(Level.OVERWORLD, spawn, FRONT.toYRot(), 0.0F));
			data.markGenerated(spawn);
			for (ServerPlayer player : level.players()) {
				if (player.distanceToSqr(anchor.getCenter()) < 96.0D * 96.0D) {
					player.teleportTo(spawn.getX() + 0.5D, spawn.getY(), spawn.getZ() + 0.5D);
					level.playSound(null, spawn, SoundEvents.IRON_DOOR_OPEN, SoundSource.PLAYERS, 0.7F, 1.15F);
				}
			}
		}
	}

	private static void maintainCruiserNearSpawn(ServerLevel level, BlockPos spawn) {
		for (ServerPlayer player : level.players()) {
			if (player.distanceToSqr(spawn.getCenter()) < 40.0D * 40.0D) {
				ensureCruiserNear(level, spawn);
				return;
			}
		}
	}

	private static void maintainTellers(ServerLevel level, BlockPos spawn) {
		BlockPos firstStation = spawn.below(2).relative(FRONT);
		BlockPos anchor = firstStation.offset(-STATION_OFFSETS[0].getX(), -STATION_OFFSETS[0].getY(), -STATION_OFFSETS[0].getZ());
		for (BlockPos offset : BANK_OFFSETS) {
			BankKitItem.ensureTellers(level, anchor.offset(offset), FRONT.getOpposite());
		}
	}

	private static void ensureCruiserNear(ServerLevel level, BlockPos spawn) {
		BlockPos firstStation = spawn.below(2).relative(FRONT);
		BlockPos parking = cruiserParkingSpot(level, firstStation);
		AABB nearby = AABB.ofSize(parking.getCenter(), 12.0D, 8.0D, 12.0D);
		if (level.getEntities(ModEntities.POLICE_CRUISER, nearby, PoliceCruiserEntity::isAlive).isEmpty()) {
			PatrolNeighborhoodSpawns.spawnCruiser(level, parking, FRONT);
		}
	}

	private static BlockPos cruiserParkingSpot(ServerLevel level, BlockPos station) {
		return PatrolNeighborhoodSpawns.cruiserParkingSpot(level, station, FRONT);
	}
}
