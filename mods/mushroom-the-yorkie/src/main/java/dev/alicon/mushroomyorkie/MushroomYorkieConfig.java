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

final class MushroomYorkieConfig {
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

	private final YorkieSpawnMode spawnMode;
	private final boolean spawnAfterSuccessfulSleep;
	private final boolean oneMushroomPerPlayer;
	private final boolean debugMessages;
	private final MushroomStructureScentConfig structureScent;

	MushroomYorkieConfig(
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
		Path configPath = configPath();
		if (!Files.exists(configPath)) {
			MushroomYorkieConfig config = defaults();
			config.save(configPath);
			return config;
		}

		try (Reader reader = Files.newBufferedReader(configPath)) {
			MushroomYorkieConfigFile file = GSON.fromJson(reader, MushroomYorkieConfigFile.class);
			if (file == null) {
				return defaults();
			}

			MushroomYorkieConfig config = file.toConfig();
			config.save(configPath);
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

	private static Path configPath() {
		return FabricLoader.getInstance().getConfigDir().resolve("mushroom_yorkie.json");
	}

	private void save(Path configPath) {
		try {
			Files.createDirectories(configPath.getParent());
			try (Writer writer = Files.newBufferedWriter(configPath)) {
				GSON.toJson(MushroomYorkieConfigFile.from(this), writer);
			}
		} catch (IOException exception) {
			MushroomTheYorkie.LOGGER.warn("Failed to write default Mushroom the Yorkie config", exception);
		}
	}
}
