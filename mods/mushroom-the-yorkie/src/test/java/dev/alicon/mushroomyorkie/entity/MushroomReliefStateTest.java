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
	@Test
	void ongoingReliefSurvivesAnOrdinaryNeedDrop() {
		MushroomReliefState state = new MushroomReliefState();
		state.tickOutdoorRelief();
		assertTrue(state.shouldAskToday(4L, false));
		state.recordRelief(4L);
		assertFalse(state.shouldAskToday(4L, true));
	}
	@Test
	void requestedTripPersistsThroughDecayAndResetsOnCancellationOrCompletion() {
		MushroomReliefState state = new MushroomReliefState();
		state.beginTrip();
		state.resetOutdoorRelief();
		assertTrue(state.shouldAskToday(4L, false));
		state.tickOutdoorRelief();
		state.endTrip();
		assertFalse(state.shouldAskToday(4L, false));
		state.beginTrip();
		state.recordRelief(4L);
		assertFalse(state.shouldAskToday(4L, true));
		assertFalse(state.shouldAskToday(5L, false));
		assertTrue(state.shouldAskToday(5L, true));
	}
}
