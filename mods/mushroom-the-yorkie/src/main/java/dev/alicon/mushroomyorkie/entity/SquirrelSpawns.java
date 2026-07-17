package dev.alicon.mushroomyorkie.entity;

import net.fabricmc.fabric.api.biome.v1.BiomeModifications;
import net.fabricmc.fabric.api.biome.v1.BiomeSelectors;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.MobCategory;
import net.minecraft.world.entity.SpawnPlacementTypes;
import net.minecraft.world.entity.SpawnPlacements;
import net.minecraft.world.entity.animal.Animal;
import net.minecraft.world.level.levelgen.Heightmap;

/** Natural woodland-animal spawning rules for squirrels. */
public final class SquirrelSpawns {
	private SquirrelSpawns() {
	}

	/** Adds small squirrel groups anywhere an established woodland animal already spawns. */
	public static void initialize() {
		SpawnPlacements.register(
				ModEntities.SQUIRREL,
				SpawnPlacementTypes.ON_GROUND,
				Heightmap.Types.MOTION_BLOCKING_NO_LEAVES,
				Animal::checkAnimalSpawnRules
		);
		BiomeModifications.addSpawn(
				BiomeSelectors.spawnsOneOf(
						EntityType.RABBIT,
						EntityType.FOX,
						EntityType.WOLF,
						EntityType.OCELOT,
						EntityType.PANDA,
						EntityType.PARROT
				),
				MobCategory.CREATURE,
				ModEntities.SQUIRREL,
				9,
				1,
				3
		);
	}
}
