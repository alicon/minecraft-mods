package dev.alicon.playtestbridge;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonObject;
import org.junit.jupiter.api.Test;

class BridgeInputControllerTest {
	@Test
	void completesOnlyAfterTheExactBurstAndANeutralTick() {
		Fixture fixture = new Fixture();
		fixture.start(3);
		for (int tick = 0; tick < 3; tick++) fixture.tick();
		assertEquals(3, fixture.target.applied);
		assertEquals("releasing", fixture.status().get("phase").getAsString());
		assertFalse(fixture.status().get("controlsReleased").getAsBoolean());
		fixture.tick();
		assertEquals("complete", fixture.status().get("phase").getAsString());
		assertEquals("completed", fixture.status().get("outcome").getAsString());
		assertTrue(fixture.status().get("controlsReleased").getAsBoolean());
		assertEquals(4, fixture.status().getAsJsonArray("clientFrames").size());
		assertTrue(fixture.target.forces.stream().noneMatch(Boolean::booleanValue),
				"Normal completion must wait for native neutral input rather than forcing its cached record");
		fixture.tick();
		assertEquals(3, fixture.target.applied);
	}

	@Test
	void contextLossDuringTheNeutralTickCannotKeepASuccessOutcome() {
		Fixture fixture = new Fixture();
		fixture.start(1);fixture.tick();
		fixture.target.invalid = "vehicle_changed";fixture.tick();
		assertEquals("vehicle_changed", fixture.status().get("outcome").getAsString());
		assertTrue(fixture.status().get("controlsReleased").getAsBoolean());
		assertEquals(1, fixture.target.applied);
	}

	@Test
	void retainedReceiptDoesNotChangeWhenPhysicalInputOrTimeChangesLater() {
		Fixture fixture = new Fixture();
		fixture.start(1);fixture.tick();fixture.tick();
		JsonObject receipt = fixture.status();
		fixture.target.held = true;fixture.now += 5000;
		assertEquals(receipt, fixture.status());
	}

	@Test
	void retryingAnIdenticalStartDoesNotRepeatMovementAndChangedControlsAreRejected() {
		Fixture fixture = new Fixture();
		var body = BridgeInputRequestTest.body();
		var request = BridgeInputRequest.parse(BridgeInputRequestTest.state(), body);
		fixture.id = fixture.controller.request(request).get("operationId").getAsString();
		fixture.tick();
		fixture.controller.request(request);
		assertEquals(1, fixture.target.applied);
		body.addProperty("ticks", 21);
		assertThrows(IllegalArgumentException.class, () -> fixture.controller.request(
				BridgeInputRequest.parse(BridgeInputRequestTest.state(), body)));
	}

	@Test
	void rejectsOverlapAndAnOldCancellationCannotTouchANewBurst() {
		Fixture fixture = new Fixture();
		String old = fixture.start(1);
		assertThrows(IllegalStateException.class, () -> fixture.start(1));
		fixture.tick(); fixture.tick();
		fixture.start(3);
		fixture.controller.cancel(old, "wall_timeout");
		fixture.tick();
		assertEquals("active", fixture.status().get("phase").getAsString());
		assertThrows(IllegalArgumentException.class, () -> fixture.controller.request(fixture.command("cancel", old)));
	}

	@Test
	void contextLossAndCancellationReleaseBeforeAnotherMovementTick() {
		for (String reason : new String[] {"save_changed", "player_changed", "vehicle_changed", "screen_open", "cancelled"}) {
			Fixture fixture = new Fixture();
			fixture.start(20);fixture.tick();
			if (reason.equals("cancelled")) fixture.controller.request(fixture.command("cancel", fixture.id));
			else fixture.target.invalid = reason;
			fixture.tick();
			assertEquals(1, fixture.target.applied, reason);
			assertEquals(reason, fixture.status().get("outcome").getAsString());
			assertTrue(fixture.target.neutral());
		}
	}

	@Test
	void wallDeadlineAdapterFailureAndShutdownHaveCleanupReceipts() {
		Fixture fixture = new Fixture();
		fixture.start(100);fixture.tick();fixture.now += BridgeInputController.MAX_WALL_MILLIS;fixture.tick();
		assertEquals(1, fixture.target.applied);
		assertEquals("wall_timeout", fixture.status().get("outcome").getAsString());
		fixture.start(100);fixture.target.failSample = true;fixture.tick();
		assertEquals("input_adapter_failed", fixture.status().get("outcome").getAsString());
		assertTrue(fixture.target.neutral());
		fixture.target.failSample = false;fixture.start(100);fixture.tick();fixture.controller.shutdown();
		assertEquals("client_stopping", fixture.status().get("outcome").getAsString());
		assertTrue(fixture.target.neutral());
	}

	@Test
	void unconfirmedReleaseIsBoundedAndNeverReportedAsSuccess() {
		Fixture fixture = new Fixture();
		fixture.start(1);fixture.target.ignoreRelease = true;
		for (int tick = 0; tick < 20; tick++) fixture.tick();
		assertEquals("release_unconfirmed", fixture.status().get("outcome").getAsString());
		assertFalse(fixture.status().get("controlsReleased").getAsBoolean());
		assertEquals(6, fixture.status().getAsJsonArray("clientFrames").size());
	}

	@Test
	void nativeActionAcknowledgementCanArriveAfterKeyReleaseWithoutAnotherPress() {
		Fixture fixture = new Fixture();fixture.start(2);fixture.target.ready = false;
		for (int tick = 0; tick < 10; tick++) fixture.tick();
		assertEquals("releasing", fixture.status().get("phase").getAsString());
		assertEquals(2, fixture.target.applied);
		assertTrue(fixture.target.neutral());
		fixture.target.ready = true;fixture.tick();
		assertEquals("completed", fixture.status().get("outcome").getAsString());
		assertTrue(fixture.status().get("controlsReleased").getAsBoolean());
		assertEquals(2, fixture.target.applied);
	}

	@Test
	void unconfirmedActionRetainsAConfirmedReleaseAndCancellationDoesNotWaitForAction() {
		Fixture fixture = new Fixture();fixture.start(2);fixture.target.ready = false;
		for (int tick = 0; tick < 50; tick++) fixture.tick();
		assertEquals("action_unconfirmed", fixture.status().get("outcome").getAsString());
		assertTrue(fixture.status().get("controlsReleased").getAsBoolean());
		assertEquals(2, fixture.target.applied);
		fixture.start(2);fixture.controller.cancel(fixture.id, "cancelled");fixture.tick();
		assertEquals("cancelled", fixture.status().get("outcome").getAsString());
		assertEquals("complete", fixture.status().get("phase").getAsString());
	}

	@Test
	void provenReleaseIsNotLostOnAStaleSampleAndDoesNotKeepWritingKeys() {
		Fixture fixture = new Fixture();fixture.target.ready = false;fixture.start(2);
		fixture.tick();fixture.tick();fixture.tick();
		int releases = fixture.target.forces.size();
		fixture.target.staleNeutral = true;fixture.tick();fixture.tick();
		assertEquals("releasing", fixture.status().get("phase").getAsString());
		assertTrue(fixture.status().get("controlsReleased").getAsBoolean());
		assertEquals(releases, fixture.target.forces.size());
		fixture.target.ready = true;fixture.tick();
		assertEquals("completed", fixture.status().get("outcome").getAsString());
	}

	@Test
	void inputOrContextChangedAfterReleaseCannotClearNewUserInput() {
		for (boolean contextChanged : new boolean[] {false, true}) {
			Fixture fixture = new Fixture();fixture.target.ready = false;fixture.start(2);
			fixture.tick();fixture.tick();fixture.tick();
			int releases = fixture.target.forces.size();
			if (contextChanged) fixture.target.invalid = "player_changed";
			else fixture.target.held = true;
			fixture.tick();
			assertEquals("complete", fixture.status().get("phase").getAsString());
			assertTrue(fixture.status().get("controlsReleased").getAsBoolean());
			assertEquals(releases, fixture.target.forces.size());
			assertEquals(contextChanged ? "player_changed" : "external_movement_input", fixture.status().get("outcome").getAsString());
			if (!contextChanged) assertTrue(fixture.target.held);
		}
	}

	@Test
	void terminalPathsAfterProvenReleaseDoNotWriteKeysAgain() {
		for (String action : new String[] {"cancelled", "client_stopping", "wall_timeout", "input_adapter_failed"}) {
			Fixture fixture = new Fixture();fixture.target.ready = false;fixture.start(2);
			fixture.tick();fixture.tick();fixture.tick();
			int releases = fixture.target.forces.size();
			if (action.equals("cancelled")) fixture.controller.cancel(fixture.id, action);
			if (action.equals("client_stopping")) fixture.controller.shutdown();
			if (action.equals("wall_timeout")) fixture.now += BridgeInputController.MAX_WALL_MILLIS;
			if (action.equals("input_adapter_failed")) fixture.target.failSample = true;
			fixture.tick();
			assertEquals(action, fixture.status().get("outcome").getAsString());
			assertEquals("complete", fixture.status().get("phase").getAsString());
			assertTrue(fixture.status().get("controlsReleased").getAsBoolean());
			assertEquals(releases, fixture.target.forces.size());
		}
	}

	private static final class Fixture {
		private long now;
		private String id;
		private final FakeTarget target = new FakeTarget();
		private final BridgeInputController controller = new BridgeInputController(this.target, () -> this.now);

		String start(int ticks) {
			var body = BridgeInputRequestTest.body();body.addProperty("ticks", ticks);
			this.id = this.controller.request(BridgeInputRequest.parse(BridgeInputRequestTest.state(), body)).get("operationId").getAsString();
			return this.id;
		}

		BridgeInputRequest command(String action, String id) {
			return new BridgeInputRequest(action, "Codex Input Test", BridgeInputRequestTest.PLAYER, id, "", 0, false, false, false, false, null);
		}

		JsonObject status() { return this.controller.request(this.command("status", this.id)); }
		void tick() { this.controller.startTick();this.controller.endTick();this.now += 50; }
	}

	private static final class FakeTarget implements BridgeInputController.Target {
		private boolean held, failSample, ignoreRelease;
		private boolean ready = true, staleNeutral;
		private int applied;
		private final java.util.List<Boolean> forces = new java.util.ArrayList<>();
		private String invalid;

		@Override public void bind(BridgeInputRequest request) { this.invalid = null; }
		@Override public String invalidContext() { return this.invalid; }
		@Override public void apply(BridgeInputRequest request) { this.held = true;this.applied++; }
		@Override public void release(boolean forceCachedInput) { this.forces.add(forceCachedInput);if (!this.ignoreRelease) this.held = false; }
		@Override public boolean neutral() { return !this.held && !this.staleNeutral; }
		@Override public boolean completionReady() { return this.ready; }
		@Override public boolean controlsDown() { return this.held; }
		@Override public JsonObject sample() {
			if (this.failSample) throw new IllegalStateException("synthetic adapter failure");
			return new JsonObject();
		}
	}
}
