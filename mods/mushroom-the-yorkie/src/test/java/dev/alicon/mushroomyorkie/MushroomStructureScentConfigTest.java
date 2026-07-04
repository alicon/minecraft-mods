package dev.alicon.mushroomyorkie;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import org.junit.jupiter.api.Test;

final class MushroomStructureScentConfigTest {
	@Test
	void filtersUnsupportedUndergroundTargetsFromExistingConfigs() {
		MushroomStructureScentConfig config = new MushroomStructureScentConfig(
				true,
				true,
				false,
				true,
				128,
				4096,
				6_000,
				10,
				120,
				45,
				4,
				48,
				80,
				600,
				10,
				List.of("village", "trial_chambers")
		);

		assertTrue(config.targets().contains("village"));
		assertFalse(config.targets().contains("trial_chambers"));
	}
}
