package dev.alicon.mushroomyorkie.entity;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

final class CreativeBuildActivityTest {
	@Test
	void threeBuildActionsInsideWindowStartFocus() {
		CreativeBuildActivity activity = new CreativeBuildActivity(0);

		activity.record(0);
		activity.record(40);
		assertFalse(activity.isFocused(41));

		activity.record(80);

		assertTrue(activity.isFocused(81));
		assertFalse(activity.isFocused(80 + 20 * 90));
	}

	@Test
	void buildWindowResetsAfterQuietGap() {
		CreativeBuildActivity activity = new CreativeBuildActivity(0);

		activity.record(0);
		activity.record(40);
		activity.record(20 * 11);

		assertFalse(activity.isFocused(20 * 11 + 1));
	}

	@Test
	void focusedActivityExtendsFocusOnAdditionalBuildAction() {
		CreativeBuildActivity activity = new CreativeBuildActivity(0);
		activity.record(0);
		activity.record(20);
		activity.record(40);

		activity.record(80);

		assertTrue(activity.isFocused(80 + 20 * 90 - 1));
		assertFalse(activity.isFocused(80 + 20 * 90));
	}

	@Test
	void staleAfterTwoFocusWindowsWithoutBuildAction() {
		CreativeBuildActivity activity = new CreativeBuildActivity(0);
		activity.record(0);

		assertFalse(activity.isStale(20 * 180));
		assertTrue(activity.isStale(20 * 180 + 1));
	}

	@Test
	void napStartsAfterQuietBuildInterval() {
		CreativeBuildActivity activity = new CreativeBuildActivity(0);
		activity.record(0);

		assertFalse(activity.shouldNap(20 * 35 - 1));
		assertTrue(activity.shouldNap(20 * 35));
	}

	@Test
	void checkInRequiresQuietIntervalRandomHitAndCooldown() {
		CreativeBuildActivity activity = new CreativeBuildActivity(0);
		activity.record(0);

		assertFalse(activity.shouldStartCheckIn(20 * 9 - 1, () -> 0));
		assertFalse(activity.shouldStartCheckIn(20 * 9, () -> 1));
		assertTrue(activity.shouldStartCheckIn(20 * 9, () -> 0));
		assertFalse(activity.shouldStartCheckIn(20 * 9 + 20, () -> 0));
	}
}
