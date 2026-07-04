package dev.alicon.mushroomyorkie;

import java.util.List;

/**
 * Gameplay tuning for Mushroom's structure-scent behavior; distances are blocks and timers are ticks.
 */
public record MushroomStructureScentConfig(
		boolean enabled,
		boolean messages,
		boolean canLoseTrail,
		int minDistanceBlocks,
		int maxDistanceBlocks,
		int cooldownTicks,
		int leadAheadBlocks,
		int foundDistanceBlocks,
		int barkIntervalTicks,
		int recoveryTicks,
		int maxTrailRiseBlocks,
		List<String> targets
) {
	static final List<String> DEFAULT_TARGETS = List.of(
			"village",
			"woodland_mansion",
			"pillager_outpost",
			"swamp_hut",
			"trial_chambers",
			"ruined_portal"
	);

	public MushroomStructureScentConfig {
		minDistanceBlocks = Math.max(32, minDistanceBlocks);
		maxDistanceBlocks = Math.max(minDistanceBlocks, maxDistanceBlocks);
		cooldownTicks = Math.max(200, cooldownTicks);
		leadAheadBlocks = Math.max(6, leadAheadBlocks);
		foundDistanceBlocks = Math.max(16, foundDistanceBlocks);
		barkIntervalTicks = Math.max(20, barkIntervalTicks);
		recoveryTicks = Math.max(40, recoveryTicks);
		maxTrailRiseBlocks = Math.max(4, maxTrailRiseBlocks);
		targets = targets == null || targets.isEmpty() ? DEFAULT_TARGETS : List.copyOf(targets);
	}

	static MushroomStructureScentConfig defaults() {
		return new MushroomStructureScentConfig(true, true, true, 128, 4096, 6_000, 18, 48, 80, 240, 10, DEFAULT_TARGETS);
	}
}
