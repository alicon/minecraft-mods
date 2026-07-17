package dev.alicon.mushroomyorkie.entity;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

final class SquirrelChasePolicyTest {
	@Test
	void chaseStopsAtThirtySeconds() {
		assertFalse(SquirrelChasePolicy.shouldGiveUp(20 * 30 - 1, false, 0.0D));
		assertTrue(SquirrelChasePolicy.shouldGiveUp(20 * 30, false, 0.0D));
	}

	@Test
	void squirrelWithoutTreeEndsChaseOutsidePlayerRadius() {
		assertFalse(SquirrelChasePolicy.shouldGiveUp(100, false, 24.0D * 24.0D));
		assertTrue(SquirrelChasePolicy.shouldGiveUp(100, false, 24.1D * 24.1D));
	}

	@Test
	void reachingTreePreventsDistanceOnlyGiveUp() {
		assertFalse(SquirrelChasePolicy.shouldGiveUp(100, true, 100.0D * 100.0D));
		assertTrue(SquirrelChasePolicy.shouldGiveUp(20 * 30, true, 0.0D));
	}
}
