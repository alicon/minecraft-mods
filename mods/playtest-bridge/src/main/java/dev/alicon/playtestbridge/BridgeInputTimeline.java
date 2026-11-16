package dev.alicon.playtestbridge;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import java.util.ArrayDeque;

/** Bounded, identity-scoped observations; this journal never controls input. */
final class BridgeInputTimeline {
	static final int CAPACITY = 1024;
	static final long IDLE_MILLIS = 30000;
	private final ArrayDeque<JsonObject> events = new ArrayDeque<>();
	private Object server;
	private String owner;
	private String save;
	private long scopeStarted;
	private long expires;
	private long sequence;
	private long dropped;
	private Long discardedThrough;
	private boolean failed;

	synchronized void arm(Object server, String save, String owner, long now) {
		if (this.server != server || !owner.equals(this.owner) || !save.equals(this.save) || now > this.expires) {
			this.events.clear();this.server = server;this.owner = owner;this.save = save;
			this.scopeStarted = now;this.dropped = 0;this.discardedThrough = null;this.failed = false;
		}
		this.expires = now + IDLE_MILLIS;
	}

	synchronized boolean accepts(Object server, String owner, long now) {
		return this.server == server && owner.equals(this.owner) && now <= this.expires && !this.failed;
	}

	synchronized void record(Object server, String owner, long now, JsonObject value) {
		if (!this.accepts(server, owner, now)) return;
		JsonObject event = value.deepCopy();
		event.addProperty("sequence", Long.toString(++this.sequence));
		event.addProperty("millis", Long.toString(now));
		if (this.events.size() == CAPACITY) {
			this.discardedThrough = Long.parseLong(this.events.removeFirst().get("millis").getAsString());this.dropped++;
		}
		this.events.addLast(event);
	}

	synchronized void fail(Object server, String owner) {
		if (this.server == server && owner.equals(this.owner)) this.failed = true;
	}

	synchronized JsonObject snapshot(Object server, String save, String owner, long since, long now) {
		boolean scoped = this.server == server && owner.equals(this.owner) && save.equals(this.save);
		JsonObject result = new JsonObject();JsonArray selected = new JsonArray();
		result.addProperty("status", "available");
		if (scoped) for (JsonObject event : this.events) {
			long time = Long.parseLong(event.get("millis").getAsString());
			if (time >= since && time <= now) selected.add(event.deepCopy());
		}
		result.add("events", selected);
		result.addProperty("captureMillis", Long.toString(now));
		result.addProperty("sinceMillis", Long.toString(since));
		result.addProperty("throughSequence", Long.toString(this.sequence));
		result.addProperty("scopeMatches", scoped);
		result.addProperty("coverageComplete", scoped && !this.failed && this.scopeStarted <= since && since <= now
				&& now <= this.expires && (this.discardedThrough == null || this.discardedThrough < since));
		if (scoped) {
			result.addProperty("scopeStartedMillis", Long.toString(this.scopeStarted));
			result.addProperty("expiresMillis", Long.toString(this.expires));
			result.addProperty("droppedEvents", this.dropped);
			result.addProperty("observationFailed", this.failed);
			if (this.discardedThrough != null) result.addProperty("discardedThroughMillis", Long.toString(this.discardedThrough));
		}
		return result;
	}

	synchronized void clear(Object server) {
		if (this.server == server) { this.events.clear();this.server = null;this.owner = null;this.save = null; }
	}
}
