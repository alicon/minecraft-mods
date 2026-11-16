package dev.alicon.mushroomyorkie.entity;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

final class WaterEscapeAttemptsTest {
	@Test
	void continuingMovementCannotKeepAnEscapeInControlForever() {
		var attempts = new WaterEscapeAttempts();
		assertTrue(attempts.continueEpisode(20));
		assertTrue(attempts.continueEpisode(99));
		assertFalse(attempts.continueEpisode(100));
		assertFalse(attempts.continueEpisode(139));
		assertTrue(attempts.continueEpisode(140));
	}

	@Test
	void remembersMoreThanOneFailedHorizontalColumn() {
		var attempts = new WaterEscapeAttempts();
		attempts.fail(1, 2, 20);
		attempts.fail(3, 4, 40);
		assertFalse(attempts.allows(1.1, 2));
		assertFalse(attempts.allows(3, 4.1));
		assertTrue(attempts.allows(5, 6));
	}

	@Test
	void repeatedFailuresReleaseControlForAFiniteCooldown() {
		var attempts = new WaterEscapeAttempts();
		for (int tick : new int[]{20, 40, 60, 80}) attempts.fail(1, 2, tick);
		assertTrue(attempts.coolingDown(119));
		assertFalse(attempts.coolingDown(120));
		assertTrue(attempts.allows(1, 2));
	}

	@Test
	void clearingAnEpisodeCannotBypassItsRetryCooldown() {
		var attempts = new WaterEscapeAttempts();
		for (int tick : new int[]{20, 40, 60, 80}) attempts.fail(1, 2, tick);
		attempts.clearRoute();
		assertTrue(attempts.coolingDown(81));
		assertFalse(attempts.coolingDown(120));
	}
}
