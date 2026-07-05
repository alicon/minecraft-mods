package dev.alicon.mushroomyorkie.entity;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

final class MushroomReliefStateTest {
	@Test
	void asksOnlyUntilRelievedForCurrentDay() {
		MushroomReliefState state = new MushroomReliefState();

		assertTrue(state.shouldAskToday(4L, true));

		state.recordRelief(4L);

		assertFalse(state.shouldAskToday(4L, true));
		assertTrue(state.shouldAskToday(5L, true));
		assertFalse(state.shouldAskToday(5L, false));
	}

	@Test
	void reliefRequiresSeveralOutdoorTicksAndCanReset() {
		MushroomReliefState state = new MushroomReliefState();

		for (int tick = 1; tick < MushroomReliefHandler.RELIEF_TICKS; tick++) {
			assertFalse(state.tickOutdoorRelief());
		}
		assertTrue(state.tickOutdoorRelief());

		state.resetOutdoorRelief();

		assertFalse(state.tickOutdoorRelief());
	}
}
