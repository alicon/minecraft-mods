package dev.alicon.playtestbridge;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import java.util.function.LongSupplier;

/** Client-thread lifecycle: a bounded input burst, a neutral tick, then a retained receipt. */
final class BridgeInputController {
	static final long MAX_WALL_MILLIS = 15000;
	private static final int MAX_RELEASE_TICKS = 5;
	static final int MAX_ACTION_CONFIRM_TICKS = 40;
	private final Target target;
	private final LongSupplier clock;
	private Operation current;

	BridgeInputController(Target target, LongSupplier clock) {
		this.target = target;
		this.clock = clock;
	}

	JsonObject request(BridgeInputRequest request) {
		if (request.action().equals("start")) {
			if (this.current != null && this.current.id.equals(request.operationId())) {
				if (!this.current.request.sameControls(request)) throw new IllegalArgumentException("input operationId was reused with different controls");
				return this.snapshot();
			}
			if (this.current != null && !this.current.complete) throw new IllegalStateException("client input is already active");
			request.validateNewStart();
			this.target.bind(request);
			this.current = new Operation(request, this.clock.getAsLong());
		} else {
			if (this.current == null || !this.current.id.equals(request.operationId())
					|| !this.current.request.expectedSave().equals(request.expectedSave())
					|| !this.current.request.playerUuid().equals(request.playerUuid())) {
				throw new IllegalArgumentException("client input operation does not match");
			}
			if (request.action().equals("cancel")) this.cancel(this.current.id, "cancelled");
		}
		return this.snapshot();
	}

	boolean allowsRecovery() {
		return this.current == null || this.current.complete && this.current.releaseConfirmed;
	}

	void startTick() {
		if (this.current == null || this.current.complete) return;
		try {
			this.current.observing = true;
			this.target.beforeTick();
			String invalid = this.target.invalidContext();
			if (invalid != null) this.release(invalid);
			if (this.clock.getAsLong() - this.current.started >= MAX_WALL_MILLIS) this.release("wall_timeout");
			if (this.current.releaseProven) {
				if (this.target.controlsDown()) this.current.outcome = "external_movement_input";
				if (!this.current.outcome.equals("completed")) this.finish(true);
				return;
			}
			if (this.current.releasing) {
				this.target.release(!this.current.outcome.equals("completed"));
			} else {
				if (this.current.firstApplyAttempt == null) this.current.firstApplyAttempt = this.clock.getAsLong();
				this.target.apply(this.current.request);
				this.current.appliedTicks++;
			}
		} catch (RuntimeException failure) {
			this.failAndRelease();
		}
	}

	void endTick() {
		if (this.current == null || this.current.complete || !this.current.observing) return;
		this.current.observing = false;
		try {
			this.current.frames.add(this.target.sample());
			if (this.current.releasing) {
				this.current.releaseTicks++;
				if (this.current.releaseProven && this.target.controlsDown()) {
					this.current.outcome = "external_movement_input";
					this.finish(true);
					return;
				}
				boolean neutral = this.current.releaseProven || this.target.neutral();
				this.current.releaseProven |= neutral;
				boolean ready = !this.current.outcome.equals("completed") || this.target.completionReady();
				if (neutral && ready) this.finish(true);
				else if (!neutral && this.current.releaseTicks >= MAX_RELEASE_TICKS) {
					this.current.outcome = "release_unconfirmed";
					this.finish(false);
				} else if (neutral && this.current.releaseTicks >= MAX_ACTION_CONFIRM_TICKS) {
					this.current.outcome = "action_unconfirmed";
					this.finish(true);
				}
			} else if (this.current.appliedTicks >= this.current.request.ticks()) {
				this.release("completed");
			}
		} catch (RuntimeException failure) {
			this.failAndRelease();
		}
	}

	void cancel(String id, String reason) {
		if (this.current != null && !this.current.complete && this.current.id.equals(id)) this.release(reason);
	}

	void shutdown() {
		if (this.current == null || this.current.complete) return;
		this.release("client_stopping");
		this.finish(this.current.releaseProven || this.target.neutral());
	}

	private void release(String reason) {
		if (this.current.releaseRequested == null) this.current.releaseRequested = this.clock.getAsLong();
		if (!this.current.releasing || this.current.outcome.equals("completed")) this.current.outcome = reason;
		this.current.releasing = true;
		if (!this.current.releaseProven) this.target.release(!reason.equals("completed"));
	}

	private void failAndRelease() {
		if (this.current.releaseRequested == null) this.current.releaseRequested = this.clock.getAsLong();
		this.current.outcome = "input_adapter_failed";
		this.current.releasing = true;
		if (!this.current.releaseProven) this.target.release(true);
		this.finish(this.current.releaseProven || this.target.neutral());
	}

	private void finish(boolean released) {
		this.current.complete = true;
		this.current.releaseConfirmed = released;
		this.current.finished = this.clock.getAsLong();
	}

	private JsonObject snapshot() {
		JsonObject result = new JsonObject();
		result.addProperty("ok", true);
		result.addProperty("operationId", this.current.id);
		result.addProperty("phase", this.current.complete ? "complete" : this.current.releasing ? "releasing" : "active");
		result.addProperty("outcome", this.current.outcome);
		result.addProperty("appliedClientTicks", this.current.appliedTicks);
		result.addProperty("elapsedMillis", (this.current.complete ? this.current.finished : this.clock.getAsLong()) - this.current.started);
		result.addProperty("startedMillis", Long.toString(this.current.started));
		if (this.current.complete) result.addProperty("finishedMillis", Long.toString(this.current.finished));
		if (this.current.firstApplyAttempt != null) result.addProperty("firstApplyAttemptMillis", Long.toString(this.current.firstApplyAttempt));
		if (this.current.releaseRequested != null) result.addProperty("releaseRequestedMillis", Long.toString(this.current.releaseRequested));
		result.addProperty("controlsReleased", this.current.complete ? this.current.releaseConfirmed : this.current.releaseProven);
		result.add("request", this.current.request.describe());
		result.add("clientFrames", this.current.frames.deepCopy());
		return result;
	}

	interface Target {
		void bind(BridgeInputRequest request);
		default void beforeTick() { }
		String invalidContext();
		void apply(BridgeInputRequest request);
		void release(boolean forceCachedInput);
		boolean neutral();
		default boolean completionReady() { return true; }
		default boolean controlsDown() { return !this.neutral(); }
		JsonObject sample();
	}

	private static final class Operation {
		private final String id;
		private final BridgeInputRequest request;
		private final long started;
		private final JsonArray frames = new JsonArray();
		private int appliedTicks;
		private int releaseTicks;
		private boolean releasing;
		private boolean complete;
		private boolean observing;
		private boolean releaseConfirmed;
		private boolean releaseProven;
		private long finished;
		private Long firstApplyAttempt;
		private Long releaseRequested;
		private String outcome = "pending";

		private Operation(BridgeInputRequest request, long started) {
			this.id = request.operationId();
			this.request = request;
			this.started = started;
		}
	}
}
