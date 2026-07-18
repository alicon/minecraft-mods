package dev.alicon.mushroomyorkie.entity;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

final class MushroomNightBehaviorTest {
	@Test
	void naturalOverworldNightUsesConfiguredWindow() {
		assertFalse(MushroomNightBehavior.isNight(true, false, 12_999L));
		assertTrue(MushroomNightBehavior.isNight(true, false, 13_000L));
		assertTrue(MushroomNightBehavior.isNight(true, false, 23_000L));
		assertFalse(MushroomNightBehavior.isNight(true, false, 23_001L));
	}

	@Test
	void netherAndFixedTimeDimensionsNeverTriggerNightSleep() {
		assertFalse(MushroomNightBehavior.isNight(false, true, 18_000L));
		assertFalse(MushroomNightBehavior.isNight(true, true, 18_000L));
	}
}
