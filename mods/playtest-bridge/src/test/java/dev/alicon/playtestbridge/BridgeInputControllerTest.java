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
		fixture.tick();
		assertEquals("complete", fixture.status().get("phase").getAsString());
		assertEquals("completed", fixture.status().get("outcome").getAsString());
		assertTrue(fixture.status().get("controlsReleased").getAsBoolean());
		assertEquals(4, fixture.status().getAsJsonArray("clientFrames").size());
		fixture.tick();
		assertEquals(3, fixture.target.applied);
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
		private int applied;
		private String invalid;

		@Override public void bind(BridgeInputRequest request) { this.invalid = null; }
		@Override public String invalidContext() { return this.invalid; }
		@Override public void apply(BridgeInputRequest request) { this.held = true;this.applied++; }
		@Override public void release(boolean forceCachedInput) { if (!this.ignoreRelease) this.held = false; }
		@Override public boolean neutral() { return !this.held; }
		@Override public JsonObject sample() {
			if (this.failSample) throw new IllegalStateException("synthetic adapter failure");
			return new JsonObject();
		}
	}
}
