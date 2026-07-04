package dev.alicon.mushroomyorkie;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import dev.alicon.mushroomyorkie.spawn.YorkieSpawnMode;
import net.fabricmc.loader.api.FabricLoader;

import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

final class MushroomYorkieConfig {
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
	private static final Path CONFIG_PATH = FabricLoader.getInstance().getConfigDir().resolve("mushroom_yorkie.json");

	private final YorkieSpawnMode spawnMode;
	private final boolean spawnAfterSuccessfulSleep;
	private final boolean oneMushroomPerPlayer;
	private final MushroomStructureScentConfig structureScent;

	private MushroomYorkieConfig(
			YorkieSpawnMode spawnMode,
			boolean spawnAfterSuccessfulSleep,
			boolean oneMushroomPerPlayer,
			MushroomStructureScentConfig structureScent
	) {
		this.spawnMode = spawnMode;
		this.spawnAfterSuccessfulSleep = spawnAfterSuccessfulSleep;
		this.oneMushroomPerPlayer = oneMushroomPerPlayer;
		this.structureScent = structureScent;
	}

	static MushroomYorkieConfig load() {
		if (!Files.exists(CONFIG_PATH)) {
			MushroomYorkieConfig config = defaults();
			config.save();
			return config;
		}

		try (Reader reader = Files.newBufferedReader(CONFIG_PATH)) {
			ConfigFile file = GSON.fromJson(reader, ConfigFile.class);
			if (file == null) {
				return defaults();
			}

			MushroomYorkieConfig config = new MushroomYorkieConfig(
					YorkieSpawnMode.fromConfigValue(file.wakeUpSpawnMode),
					file.spawnAfterSuccessfulSleep,
					file.oneMushroomPerPlayer == null || file.oneMushroomPerPlayer,
					structureScentFrom(file)
			);
			config.save();
			return config;
		} catch (IOException exception) {
			MushroomTheYorkie.LOGGER.warn("Failed to read Mushroom the Yorkie config, using defaults", exception);
			return defaults();
		}
	}

	YorkieSpawnMode spawnMode() {
		return this.spawnMode;
	}

	boolean spawnAfterSuccessfulSleep() {
		return this.spawnAfterSuccessfulSleep;
	}

	boolean oneMushroomPerPlayer() {
		return this.oneMushroomPerPlayer;
	}

	MushroomStructureScentConfig structureScent() {
		return this.structureScent;
	}

	private static MushroomYorkieConfig defaults() {
		return new MushroomYorkieConfig(YorkieSpawnMode.RESPAWN, true, true, MushroomStructureScentConfig.defaults());
	}

	private static MushroomStructureScentConfig structureScentFrom(ConfigFile file) {
		MushroomStructureScentConfig defaults = MushroomStructureScentConfig.defaults();
		return new MushroomStructureScentConfig(
				file.structureScentingEnabled == null ? defaults.enabled() : file.structureScentingEnabled,
				file.structureScentMessages == null ? defaults.messages() : file.structureScentMessages,
				file.structureScentCanLoseTrail == null ? defaults.canLoseTrail() : file.structureScentCanLoseTrail,
				file.structureScentMinDistanceBlocks == null ? defaults.minDistanceBlocks() : file.structureScentMinDistanceBlocks,
				file.structureScentMaxDistanceBlocks == null ? defaults.maxDistanceBlocks() : file.structureScentMaxDistanceBlocks,
				file.structureScentCooldownTicks == null ? defaults.cooldownTicks() : file.structureScentCooldownTicks,
				file.structureScentLeadAheadBlocks == null ? defaults.leadAheadBlocks() : file.structureScentLeadAheadBlocks,
				file.structureScentFoundDistanceBlocks == null ? defaults.foundDistanceBlocks() : file.structureScentFoundDistanceBlocks,
				file.structureScentBarkIntervalTicks == null ? defaults.barkIntervalTicks() : file.structureScentBarkIntervalTicks,
				file.structureScentRecoveryTicks == null ? defaults.recoveryTicks() : file.structureScentRecoveryTicks,
				file.structureScentMaxTrailRiseBlocks == null ? defaults.maxTrailRiseBlocks() : file.structureScentMaxTrailRiseBlocks,
				file.structureScentTargets == null ? defaults.targets() : file.structureScentTargets
		);
	}

	private void save() {
		try {
			Files.createDirectories(CONFIG_PATH.getParent());
			try (Writer writer = Files.newBufferedWriter(CONFIG_PATH)) {
				GSON.toJson(ConfigFile.from(this), writer);
			}
		} catch (IOException exception) {
			MushroomTheYorkie.LOGGER.warn("Failed to write default Mushroom the Yorkie config", exception);
		}
	}

	private static final class ConfigFile {
		String wakeUpSpawnMode = YorkieSpawnMode.RESPAWN.configValue();
		boolean spawnAfterSuccessfulSleep = true;
		Boolean oneMushroomPerPlayer = true;
		Boolean structureScentingEnabled = true;
		Boolean structureScentMessages = true;
		Boolean structureScentCanLoseTrail = true;
		Integer structureScentMinDistanceBlocks = 128;
		Integer structureScentMaxDistanceBlocks = 4096;
		Integer structureScentCooldownTicks = 6_000;
		Integer structureScentLeadAheadBlocks = 18;
		Integer structureScentFoundDistanceBlocks = 48;
		Integer structureScentBarkIntervalTicks = 80;
		Integer structureScentRecoveryTicks = 240;
		Integer structureScentMaxTrailRiseBlocks = 10;
		List<String> structureScentTargets = MushroomStructureScentConfig.DEFAULT_TARGETS;

		private static ConfigFile from(MushroomYorkieConfig config) {
			ConfigFile file = new ConfigFile();
			file.wakeUpSpawnMode = config.spawnMode.configValue();
			file.spawnAfterSuccessfulSleep = config.spawnAfterSuccessfulSleep;
			file.oneMushroomPerPlayer = config.oneMushroomPerPlayer;
			file.structureScentingEnabled = config.structureScent.enabled();
			file.structureScentMessages = config.structureScent.messages();
			file.structureScentCanLoseTrail = config.structureScent.canLoseTrail();
			file.structureScentMinDistanceBlocks = config.structureScent.minDistanceBlocks();
			file.structureScentMaxDistanceBlocks = config.structureScent.maxDistanceBlocks();
			file.structureScentCooldownTicks = config.structureScent.cooldownTicks();
			file.structureScentLeadAheadBlocks = config.structureScent.leadAheadBlocks();
			file.structureScentFoundDistanceBlocks = config.structureScent.foundDistanceBlocks();
			file.structureScentBarkIntervalTicks = config.structureScent.barkIntervalTicks();
			file.structureScentRecoveryTicks = config.structureScent.recoveryTicks();
			file.structureScentMaxTrailRiseBlocks = config.structureScent.maxTrailRiseBlocks();
			file.structureScentTargets = config.structureScent.targets();
			return file;
		}
	}
}
