package dev.alicon.mushroomyorkie;

import java.util.List;
import java.util.Set;

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
			"ruined_portal"
	);
	private static final Set<String> SUPPORTED_TARGETS = Set.copyOf(DEFAULT_TARGETS);

	public MushroomStructureScentConfig {
		minDistanceBlocks = Math.max(32, minDistanceBlocks);
		maxDistanceBlocks = Math.max(minDistanceBlocks, maxDistanceBlocks);
		cooldownTicks = Math.max(200, cooldownTicks);
		leadAheadBlocks = Math.max(6, leadAheadBlocks);
		foundDistanceBlocks = Math.max(16, foundDistanceBlocks);
		barkIntervalTicks = Math.max(20, barkIntervalTicks);
		recoveryTicks = Math.max(40, recoveryTicks);
		maxTrailRiseBlocks = Math.max(4, maxTrailRiseBlocks);
		targets = supportedTargets(targets);
	}

	static MushroomStructureScentConfig defaults() {
		return new MushroomStructureScentConfig(true, true, true, 128, 4096, 6_000, 10, 48, 80, 240, 10, DEFAULT_TARGETS);
	}

	private static List<String> supportedTargets(List<String> targets) {
		if (targets == null || targets.isEmpty()) {
			return DEFAULT_TARGETS;
		}

		List<String> filtered = targets.stream()
				.filter(SUPPORTED_TARGETS::contains)
				.toList();
		return filtered.isEmpty() ? DEFAULT_TARGETS : filtered;
	}
}
