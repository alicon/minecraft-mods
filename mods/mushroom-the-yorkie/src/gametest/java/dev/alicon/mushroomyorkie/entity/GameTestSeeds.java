package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.MushroomTheYorkie;
import net.minecraft.world.entity.Mob;

/** Records an entity RNG stream; structure origins and other world state remain separate replay inputs. */
final class GameTestSeeds {
	private GameTestSeeds() {
	}

	static long apply(Mob mob, String fixture) {
		String configured = System.getenv("MUSHROOM_GAME_TEST_SEED");
		long seed = configured == null ? mob.getRandom().nextLong() : Long.parseLong(configured);
		mob.getRandom().setSeed(seed);
		MushroomTheYorkie.LOGGER.info("Native fixture={} entity={} position={} seed={}", fixture, mob.getUUID(), mob.position(), seed);
		return seed;
	}
}
