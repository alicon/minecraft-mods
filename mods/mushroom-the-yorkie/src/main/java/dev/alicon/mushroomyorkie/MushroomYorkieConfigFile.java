package dev.alicon.mushroomyorkie;

import dev.alicon.mushroomyorkie.spawn.YorkieSpawnMode;

import java.util.List;

final class MushroomYorkieConfigFile {
	private static final int LEGACY_STRUCTURE_SCENT_MIN_DISTANCE_BLOCKS = 128;
	private static final int LEGACY_STRUCTURE_SCENT_MAX_DISTANCE_BLOCKS = 4096;
	private static final int LEGACY_STRUCTURE_SCENT_FOUND_DISTANCE_BLOCKS = 48;

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

	MushroomYorkieConfig toConfig() {
		return new MushroomYorkieConfig(
				YorkieSpawnMode.fromConfigValue(this.wakeUpSpawnMode),
				this.spawnAfterSuccessfulSleep,
				this.oneMushroomPerPlayer == null || this.oneMushroomPerPlayer,
				this.debugMessages(),
				this.structureScent()
		);
	}

	static MushroomYorkieConfigFile from(MushroomYorkieConfig config) {
		MushroomYorkieConfigFile file = new MushroomYorkieConfigFile();
		file.wakeUpSpawnMode = config.spawnMode().configValue();
		file.spawnAfterSuccessfulSleep = config.spawnAfterSuccessfulSleep();
		file.oneMushroomPerPlayer = config.oneMushroomPerPlayer();
		file.debugMessages = config.debugMessages();
		file.structureScentingEnabled = config.structureScent().enabled();
		file.structureScentMessages = config.structureScent().messages();
		file.structureScentDebugMessages = config.structureScent().debugMessages();
		file.structureScentCanLoseTrail = config.structureScent().canLoseTrail();
		file.structureScentMinDistanceBlocks = config.structureScent().minDistanceBlocks();
		file.structureScentMaxDistanceBlocks = config.structureScent().maxDistanceBlocks();
		file.structureScentCooldownTicks = config.structureScent().cooldownTicks();
		file.structureScentLeadAheadBlocks = config.structureScent().leadAheadBlocks();
		file.structureScentCircleBackIntervalTicks = config.structureScent().circleBackIntervalTicks();
		file.structureScentCircleBackTicks = config.structureScent().circleBackTicks();
		file.structureScentCircleBackDistanceBlocks = config.structureScent().circleBackDistanceBlocks();
		file.structureScentFoundDistanceBlocks = config.structureScent().foundDistanceBlocks();
		file.structureScentBarkIntervalTicks = config.structureScent().barkIntervalTicks();
		file.structureScentRecoveryTicks = config.structureScent().recoveryTicks();
		file.structureScentMaxTrailRiseBlocks = config.structureScent().maxTrailRiseBlocks();
		file.structureScentTargets = config.structureScent().targets();
		return file;
	}

	private boolean debugMessages() {
		if (this.debugMessages != null) {
			return this.debugMessages;
		}

		return this.structureScentDebugMessages != null && this.structureScentDebugMessages;
	}

	private MushroomStructureScentConfig structureScent() {
		MushroomStructureScentConfig defaults = MushroomStructureScentConfig.defaults();
		boolean migrateLegacyGeneratedRange = this.usesLegacyGeneratedScentRange();
		return new MushroomStructureScentConfig(
				this.structureScentingEnabled == null ? defaults.enabled() : this.structureScentingEnabled,
				this.structureScentMessages == null ? defaults.messages() : this.structureScentMessages,
				this.structureScentDebugMessages == null ? defaults.debugMessages() : this.structureScentDebugMessages,
				this.structureScentCanLoseTrail == null ? defaults.canLoseTrail() : this.structureScentCanLoseTrail,
				this.migratedLegacyInt(this.structureScentMinDistanceBlocks, LEGACY_STRUCTURE_SCENT_MIN_DISTANCE_BLOCKS, defaults.minDistanceBlocks(), migrateLegacyGeneratedRange),
				this.migratedLegacyInt(this.structureScentMaxDistanceBlocks, LEGACY_STRUCTURE_SCENT_MAX_DISTANCE_BLOCKS, defaults.maxDistanceBlocks(), migrateLegacyGeneratedRange),
				this.structureScentCooldownTicks == null ? defaults.cooldownTicks() : this.structureScentCooldownTicks,
				this.structureScentLeadAheadBlocks == null ? defaults.leadAheadBlocks() : this.structureScentLeadAheadBlocks,
				this.structureScentCircleBackIntervalTicks == null ? defaults.circleBackIntervalTicks() : this.structureScentCircleBackIntervalTicks,
				this.structureScentCircleBackTicks == null ? defaults.circleBackTicks() : this.structureScentCircleBackTicks,
				this.structureScentCircleBackDistanceBlocks == null ? defaults.circleBackDistanceBlocks() : this.structureScentCircleBackDistanceBlocks,
				this.migratedLegacyInt(this.structureScentFoundDistanceBlocks, LEGACY_STRUCTURE_SCENT_FOUND_DISTANCE_BLOCKS, defaults.foundDistanceBlocks(), migrateLegacyGeneratedRange),
				this.structureScentBarkIntervalTicks == null ? defaults.barkIntervalTicks() : this.structureScentBarkIntervalTicks,
				this.structureScentRecoveryTicks == null ? defaults.recoveryTicks() : this.structureScentRecoveryTicks,
				this.structureScentMaxTrailRiseBlocks == null ? defaults.maxTrailRiseBlocks() : this.structureScentMaxTrailRiseBlocks,
				this.structureScentTargets == null ? defaults.targets() : this.structureScentTargets
		);
	}

	private boolean usesLegacyGeneratedScentRange() {
		return Integer.valueOf(LEGACY_STRUCTURE_SCENT_MIN_DISTANCE_BLOCKS).equals(this.structureScentMinDistanceBlocks)
				&& Integer.valueOf(LEGACY_STRUCTURE_SCENT_MAX_DISTANCE_BLOCKS).equals(this.structureScentMaxDistanceBlocks);
	}

	private int migratedLegacyInt(Integer value, int legacyDefault, int newDefault, boolean migrateLegacyGeneratedRange) {
		if (value == null) {
			return newDefault;
		}

		return migrateLegacyGeneratedRange && value == legacyDefault ? newDefault : value;
	}
}
