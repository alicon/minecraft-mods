package dev.alicon.mushroomyorkie.entity;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

final class StructureScentTrailConfidenceTest {
	@Test
	void staysClearUntilBlockedThreshold() {
		StructureScentTrailConfidence confidence = new StructureScentTrailConfidence();

		for (int tick = 1; tick < StructureScentTrailConfidence.LOST_BLOCKED_TICKS; tick++) {
			StructureScentTrailUpdate update = confidence.tick(true, 20);

			assertFalse(update.recovering());
			assertFalse(update.startedRecovery());
		}
	}

	@Test
	void startsRecoveryAfterSustainedBlockedTrail() {
		StructureScentTrailConfidence confidence = blockedTrailAtThreshold();

		StructureScentTrailUpdate update = confidence.tick(true, 20);

		assertTrue(update.recovering());
		assertTrue(update.startedRecovery());
	}

	@Test
	void recoversAfterClearTrailWindow() {
		StructureScentTrailConfidence confidence = recoveringTrail(80);

		StructureScentTrailUpdate update = null;
		for (int tick = 0; tick < StructureScentTrailConfidence.RECOVER_CLEAR_TICKS; tick++) {
			update = confidence.tick(false, 80);
		}

		assertTrue(update.recovered());
		assertFalse(update.recovering());
	}

	@Test
	void givesUpWhenRecoveryWindowExpires() {
		StructureScentTrailConfidence confidence = recoveringTrail(2);

		StructureScentTrailUpdate update = confidence.tick(true, 2);

		assertTrue(update.recovering());
		assertTrue(update.gaveUp());
	}

	private static StructureScentTrailConfidence blockedTrailAtThreshold() {
		StructureScentTrailConfidence confidence = new StructureScentTrailConfidence();
		for (int tick = 1; tick < StructureScentTrailConfidence.LOST_BLOCKED_TICKS; tick++) {
			confidence.tick(true, 20);
		}
		return confidence;
	}

	private static StructureScentTrailConfidence recoveringTrail(int recoveryTicks) {
		StructureScentTrailConfidence confidence = blockedTrailAtThreshold();
		confidence.tick(true, recoveryTicks);
		return confidence;
	}
}
