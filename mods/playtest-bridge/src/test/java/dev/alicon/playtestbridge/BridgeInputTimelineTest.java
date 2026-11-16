package dev.alicon.playtestbridge;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonObject;
import org.junit.jupiter.api.Test;

class BridgeInputTimelineTest {
	private final BridgeInputTimeline timeline = new BridgeInputTimeline();
	private final Object server = new Object();

	@Test
	void packetAndRideOrderSurvivesEqualMillisecondTimestamps() {
		this.arm(10);
		this.event(20, "input_packet", true);
		this.event(20, "input_packet", false);
		this.event(20, "ride_tick_start", false);
		var result = this.snapshot(10, 21);var events = result.getAsJsonArray("events");
		assertTrue(result.get("coverageComplete").getAsBoolean());assertEquals(3, events.size());
		assertEquals("1", events.get(0).getAsJsonObject().get("sequence").getAsString());
		assertEquals("3", events.get(2).getAsJsonObject().get("sequence").getAsString());
		assertTrue(events.get(0).getAsJsonObject().get("shiftKeyDown").getAsBoolean());
		assertFalse(events.get(2).getAsJsonObject().get("shiftKeyDown").getAsBoolean());
	}

	@Test
	void retriesKeepEvidenceAndSnapshotsCannotMutateTheJournal() {
		this.arm(0);JsonObject original = new JsonObject();original.addProperty("kind", "input_packet");
		this.timeline.record(this.server, "owner", 1, original);original.addProperty("kind", "changed");
		this.arm(2);var first = this.snapshot(0, 3);
		first.getAsJsonArray("events").get(0).getAsJsonObject().addProperty("kind", "changed again");
		assertEquals("input_packet", this.snapshot(0, 4).getAsJsonArray("events").get(0).getAsJsonObject().get("kind").getAsString());
		assertTrue(this.snapshot(0, 4).get("coverageComplete").getAsBoolean());
	}

	@Test
	void wrongOwnerServerAndSaveCannotExposeOrAppendEvents() {
		this.arm(0);this.event(1, "ride_tick_start", false);
		this.timeline.record(new Object(), "owner", 2, new JsonObject());
		this.timeline.record(this.server, "other", 2, new JsonObject());
		assertEquals(1, this.snapshot(0, 3).getAsJsonArray("events").size());
		for (var result : new JsonObject[] {
				this.timeline.snapshot(new Object(), "save", "owner", 0, 3),
				this.timeline.snapshot(this.server, "save", "other", 0, 3),
				this.timeline.snapshot(this.server, "other-save", "owner", 0, 3) }) {
			assertFalse(result.get("scopeMatches").getAsBoolean());
			assertFalse(result.get("coverageComplete").getAsBoolean());assertEquals(0, result.getAsJsonArray("events").size());
		}
	}

	@Test
	void overflowIsExplicitAndOnlyInvalidatesWindowsContainingDiscardedEvents() {
		this.arm(0);
		for (int i = 0; i <= BridgeInputTimeline.CAPACITY; i++) this.event(i, "ride_tick_start", false);
		var old = this.snapshot(0, 2000);
		assertEquals(BridgeInputTimeline.CAPACITY, old.getAsJsonArray("events").size());
		assertEquals(1, old.get("droppedEvents").getAsInt());assertFalse(old.get("coverageComplete").getAsBoolean());
		var recent = this.snapshot(1, 2000);
		assertTrue(recent.get("coverageComplete").getAsBoolean());
		assertEquals("2", recent.getAsJsonArray("events").get(0).getAsJsonObject().get("sequence").getAsString());
	}

	@Test
	void expirationStopsRecordingAndRearmingCannotClaimEarlierCoverage() {
		this.arm(10);this.event(11, "input_packet", true);
		long later = 11 + BridgeInputTimeline.IDLE_MILLIS;
		assertFalse(this.timeline.accepts(this.server, "owner", later));
		this.event(later, "input_packet", false);
		assertEquals(1, this.snapshot(10, later).getAsJsonArray("events").size());
		assertFalse(this.snapshot(10, later).get("coverageComplete").getAsBoolean());
		this.arm(later);assertEquals(0, this.snapshot(10, later).getAsJsonArray("events").size());
		assertFalse(this.snapshot(10, later).get("coverageComplete").getAsBoolean());
	}

	@Test
	void observerFailureAndShutdownInvalidateCoverageWithoutControllingInput() {
		this.arm(0);this.event(1, "input_packet", true);
		this.timeline.fail(new Object(), "owner");assertTrue(this.snapshot(0, 2).get("coverageComplete").getAsBoolean());
		this.timeline.fail(this.server, "owner");
		assertTrue(this.snapshot(0, 2).get("observationFailed").getAsBoolean());
		assertFalse(this.snapshot(0, 2).get("coverageComplete").getAsBoolean());
		this.timeline.clear(new Object());assertEquals(1, this.snapshot(0, 2).getAsJsonArray("events").size());
		this.timeline.clear(this.server);assertFalse(this.snapshot(0, 3).get("scopeMatches").getAsBoolean());
	}

	@Test
	void equalTimeEventsAfterASnapshotHaveLaterSequenceNumbers() {
		this.arm(0);this.event(1, "input_packet", true);
		var before = this.snapshot(0, 1);this.event(1, "input_packet", false);
		assertEquals("1", before.get("throughSequence").getAsString());
		assertEquals(1, before.getAsJsonArray("events").size());
		assertEquals("2", this.snapshot(0, 1).get("throughSequence").getAsString());
	}

	@Test
	void aFutureWindowCannotBeCalledComplete() {
		this.arm(0);this.event(1, "input_packet", true);
		assertFalse(this.snapshot(10, 2).get("coverageComplete").getAsBoolean());
	}

	@Test
	void aDifferentContextDiscardsThePreviousWorldsEvents() {
		this.arm(0);this.event(1, "input_packet", true);
		this.timeline.arm(this.server, "another-save", "owner", 2);
		var result = this.timeline.snapshot(this.server, "another-save", "owner", 2, 3);
		assertEquals(0, result.getAsJsonArray("events").size());assertTrue(result.get("coverageComplete").getAsBoolean());
		assertFalse(this.snapshot(0, 3).get("scopeMatches").getAsBoolean());
	}

	private void arm(long time) { this.timeline.arm(this.server, "save", "owner", time); }
	private JsonObject snapshot(long since, long now) { return this.timeline.snapshot(this.server, "save", "owner", since, now); }
	private void event(long time, String kind, boolean shift) {
		JsonObject event = new JsonObject();event.addProperty("kind", kind);event.addProperty("shiftKeyDown", shift);
		this.timeline.record(this.server, "owner", time, event);
	}
}
