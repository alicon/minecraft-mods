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
	private static final int LEGACY_STRUCTURE_SCENT_MIN_DISTANCE_BLOCKS = 128;
	private static final int LEGACY_STRUCTURE_SCENT_MAX_DISTANCE_BLOCKS = 4096;
	private static final int LEGACY_STRUCTURE_SCENT_FOUND_DISTANCE_BLOCKS = 48;

	private final YorkieSpawnMode spawnMode;
	private final boolean spawnAfterSuccessfulSleep;
	private final boolean oneMushroomPerPlayer;
	private final boolean debugMessages;
	private final MushroomStructureScentConfig structureScent;

	private MushroomYorkieConfig(
			YorkieSpawnMode spawnMode,
			boolean spawnAfterSuccessfulSleep,
			boolean oneMushroomPerPlayer,
			boolean debugMessages,
			MushroomStructureScentConfig structureScent
	) {
		this.spawnMode = spawnMode;
		this.spawnAfterSuccessfulSleep = spawnAfterSuccessfulSleep;
		this.oneMushroomPerPlayer = oneMushroomPerPlayer;
		this.debugMessages = debugMessages;
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
					debugMessagesFrom(file),
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

	boolean debugMessages() {
		return this.debugMessages;
	}

	MushroomStructureScentConfig structureScent() {
		return this.structureScent;
	}

	private static MushroomYorkieConfig defaults() {
		return new MushroomYorkieConfig(YorkieSpawnMode.RESPAWN, true, true, false, MushroomStructureScentConfig.defaults());
	}

	private static boolean debugMessagesFrom(ConfigFile file) {
		if (file.debugMessages != null) {
			return file.debugMessages;
		}

		return file.structureScentDebugMessages != null && file.structureScentDebugMessages;
	}

	private static MushroomStructureScentConfig structureScentFrom(ConfigFile file) {
		MushroomStructureScentConfig defaults = MushroomStructureScentConfig.defaults();
		boolean migrateLegacyGeneratedRange = usesLegacyGeneratedScentRange(file);
		return new MushroomStructureScentConfig(
				file.structureScentingEnabled == null ? defaults.enabled() : file.structureScentingEnabled,
				file.structureScentMessages == null ? defaults.messages() : file.structureScentMessages,
				file.structureScentDebugMessages == null ? defaults.debugMessages() : file.structureScentDebugMessages,
				file.structureScentCanLoseTrail == null ? defaults.canLoseTrail() : file.structureScentCanLoseTrail,
				migratedLegacyInt(file.structureScentMinDistanceBlocks, LEGACY_STRUCTURE_SCENT_MIN_DISTANCE_BLOCKS, defaults.minDistanceBlocks(), migrateLegacyGeneratedRange),
				migratedLegacyInt(file.structureScentMaxDistanceBlocks, LEGACY_STRUCTURE_SCENT_MAX_DISTANCE_BLOCKS, defaults.maxDistanceBlocks(), migrateLegacyGeneratedRange),
				file.structureScentCooldownTicks == null ? defaults.cooldownTicks() : file.structureScentCooldownTicks,
				file.structureScentLeadAheadBlocks == null ? defaults.leadAheadBlocks() : file.structureScentLeadAheadBlocks,
				file.structureScentCircleBackIntervalTicks == null ? defaults.circleBackIntervalTicks() : file.structureScentCircleBackIntervalTicks,
				file.structureScentCircleBackTicks == null ? defaults.circleBackTicks() : file.structureScentCircleBackTicks,
				file.structureScentCircleBackDistanceBlocks == null ? defaults.circleBackDistanceBlocks() : file.structureScentCircleBackDistanceBlocks,
				migratedLegacyInt(file.structureScentFoundDistanceBlocks, LEGACY_STRUCTURE_SCENT_FOUND_DISTANCE_BLOCKS, defaults.foundDistanceBlocks(), migrateLegacyGeneratedRange),
				file.structureScentBarkIntervalTicks == null ? defaults.barkIntervalTicks() : file.structureScentBarkIntervalTicks,
				file.structureScentRecoveryTicks == null ? defaults.recoveryTicks() : file.structureScentRecoveryTicks,
				file.structureScentMaxTrailRiseBlocks == null ? defaults.maxTrailRiseBlocks() : file.structureScentMaxTrailRiseBlocks,
				file.structureScentTargets == null ? defaults.targets() : file.structureScentTargets
		);
	}

	private static boolean usesLegacyGeneratedScentRange(ConfigFile file) {
		return Integer.valueOf(LEGACY_STRUCTURE_SCENT_MIN_DISTANCE_BLOCKS).equals(file.structureScentMinDistanceBlocks)
				&& Integer.valueOf(LEGACY_STRUCTURE_SCENT_MAX_DISTANCE_BLOCKS).equals(file.structureScentMaxDistanceBlocks);
	}

	private static int migratedLegacyInt(Integer value, int legacyDefault, int newDefault, boolean migrateLegacyGeneratedRange) {
		if (value == null) {
			return newDefault;
		}

		return migrateLegacyGeneratedRange && value == legacyDefault ? newDefault : value;
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
		Boolean debugMessages;
		Boolean structureScentingEnabled = true;
		Boolean structureScentMessages = true;
		Boolean structureScentDebugMessages = false;
		Boolean structureScentCanLoseTrail = false;
		Integer structureScentMinDistanceBlocks = MushroomStructureScentConfig.DEFAULT_MIN_DISTANCE_BLOCKS;
		Integer structureScentMaxDistanceBlocks = MushroomStructureScentConfig.DEFAULT_MAX_DISTANCE_BLOCKS;
		Integer structureScentCooldownTicks = 6_000;
		Integer structureScentLeadAheadBlocks = 10;
		Integer structureScentCircleBackIntervalTicks = 120;
		Integer structureScentCircleBackTicks = 45;
		Integer structureScentCircleBackDistanceBlocks = 4;
		Integer structureScentFoundDistanceBlocks = MushroomStructureScentConfig.DEFAULT_FOUND_DISTANCE_BLOCKS;
		Integer structureScentBarkIntervalTicks = 80;
		Integer structureScentRecoveryTicks = 600;
		Integer structureScentMaxTrailRiseBlocks = 10;
		List<String> structureScentTargets = MushroomStructureScentConfig.DEFAULT_TARGETS;

		private static ConfigFile from(MushroomYorkieConfig config) {
			ConfigFile file = new ConfigFile();
			file.wakeUpSpawnMode = config.spawnMode.configValue();
			file.spawnAfterSuccessfulSleep = config.spawnAfterSuccessfulSleep;
			file.oneMushroomPerPlayer = config.oneMushroomPerPlayer;
			file.debugMessages = config.debugMessages;
			file.structureScentingEnabled = config.structureScent.enabled();
			file.structureScentMessages = config.structureScent.messages();
			file.structureScentDebugMessages = config.structureScent.debugMessages();
			file.structureScentCanLoseTrail = config.structureScent.canLoseTrail();
			file.structureScentMinDistanceBlocks = config.structureScent.minDistanceBlocks();
			file.structureScentMaxDistanceBlocks = config.structureScent.maxDistanceBlocks();
			file.structureScentCooldownTicks = config.structureScent.cooldownTicks();
			file.structureScentLeadAheadBlocks = config.structureScent.leadAheadBlocks();
			file.structureScentCircleBackIntervalTicks = config.structureScent.circleBackIntervalTicks();
			file.structureScentCircleBackTicks = config.structureScent.circleBackTicks();
			file.structureScentCircleBackDistanceBlocks = config.structureScent.circleBackDistanceBlocks();
			file.structureScentFoundDistanceBlocks = config.structureScent.foundDistanceBlocks();
			file.structureScentBarkIntervalTicks = config.structureScent.barkIntervalTicks();
			file.structureScentRecoveryTicks = config.structureScent.recoveryTicks();
			file.structureScentMaxTrailRiseBlocks = config.structureScent.maxTrailRiseBlocks();
			file.structureScentTargets = config.structureScent.targets();
			return file;
		}
	}
}
