package dev.alicon.mushroomyorkie;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

final class MushroomYorkieConfigFileTest {
	@Test
	void generatedLegacyStructureScentRangeMigratesToCurrentDefaults() {
		MushroomYorkieConfigFile file = new MushroomYorkieConfigFile();
		file.structureScentMinDistanceBlocks = 128;
		file.structureScentMaxDistanceBlocks = 4096;
		file.structureScentFoundDistanceBlocks = 48;

		MushroomStructureScentConfig scent = file.toConfig().structureScent();

		assertEquals(MushroomStructureScentConfig.DEFAULT_MIN_DISTANCE_BLOCKS, scent.minDistanceBlocks());
		assertEquals(MushroomStructureScentConfig.DEFAULT_MAX_DISTANCE_BLOCKS, scent.maxDistanceBlocks());
		assertEquals(MushroomStructureScentConfig.DEFAULT_FOUND_DISTANCE_BLOCKS, scent.foundDistanceBlocks());
	}

	@Test
	void customStructureScentRangeIsPreserved() {
		MushroomYorkieConfigFile file = new MushroomYorkieConfigFile();
		file.structureScentMinDistanceBlocks = 160;
		file.structureScentMaxDistanceBlocks = 512;
		file.structureScentFoundDistanceBlocks = 64;

		MushroomStructureScentConfig scent = file.toConfig().structureScent();

		assertEquals(160, scent.minDistanceBlocks());
		assertEquals(512, scent.maxDistanceBlocks());
		assertEquals(64, scent.foundDistanceBlocks());
	}

	@Test
	void legacyStructureDebugFlagFeedsGlobalDebugWhenNewFlagIsMissing() {
		MushroomYorkieConfigFile file = new MushroomYorkieConfigFile();
		file.debugMessages = null;
		file.structureScentDebugMessages = true;

		assertTrue(file.toConfig().debugMessages());
	}

	@Test
	void explicitDebugFlagWinsOverLegacyStructureDebugFlag() {
		MushroomYorkieConfigFile file = new MushroomYorkieConfigFile();
		file.debugMessages = false;
		file.structureScentDebugMessages = true;

		assertFalse(file.toConfig().debugMessages());
	}
}
