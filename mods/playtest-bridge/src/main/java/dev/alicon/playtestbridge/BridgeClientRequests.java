package dev.alicon.playtestbridge;

import com.google.gson.JsonObject;
import java.util.Locale;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

/** Client requests stay separate from world mutations and validate before dispatch. */
final class BridgeClientRequests {
	private BridgeClientRequests() {
	}

	static JsonObject screenshot(JsonObject body) throws Exception {
		String name = string(body, "name");
		return BridgeClientHooks.captureScreenshot(name, bool(body, "resume", true),
				bool(body, "hideGui", false), bool(body, "clearChat", false)).get(10, TimeUnit.SECONDS);
	}

	static JsonObject respawn(JsonObject state, JsonObject body) throws Exception {
		var future = BridgeClientHooks.respawn(BridgeRespawnRequest.parse(state, body));
		try {
			return future.get(5, TimeUnit.SECONDS);
		} catch (Exception failure) {
			future.cancel(false);
			throw failure;
		}
	}

	static JsonObject quit(JsonObject state, JsonObject body) throws Exception {
		String expectedSave = validateQuit(state, body);
		return BridgeClientHooks.requestQuit(expectedSave).get(10, TimeUnit.SECONDS);
	}

	static JsonObject input(JsonObject state, JsonObject body) throws Exception {
		BridgeInputRequest request = BridgeInputRequest.parse(state, body);
		var future = BridgeClientHooks.input(request);
		try {
			JsonObject response = future.get(5, TimeUnit.SECONDS);
			response.add("serverSnapshot", state);
			return response;
		} catch (Exception failure) {
			future.cancel(false);
			throw failure;
		}
	}

	// The route invokes this supplier on the server thread; both threads share nanoTime.
	static JsonObject captureInputState(Supplier<JsonObject> stateProvider) {
		long started = TimeUnit.NANOSECONDS.toMillis(System.nanoTime());
		JsonObject snapshot = stateProvider.get();
		snapshot.addProperty("inputObservationStartMillis", Long.toString(started));
		snapshot.addProperty("inputObservationEndMillis", Long.toString(TimeUnit.NANOSECONDS.toMillis(System.nanoTime())));
		return snapshot;
	}

	static String validateQuit(JsonObject state, JsonObject body) {
		return validateTestWorld(state, body, "quit");
	}

	static String validateTestWorld(JsonObject state, JsonObject body, String action) {
		String expectedSave = string(body, "expectedSave");
		if (expectedSave.isEmpty() || !expectedSave.equals(string(state, "saveName"))) {
			throw new IllegalArgumentException(action + " requires the exact expectedSave name");
		}
		if (!(expectedSave.startsWith("Codex ") || expectedSave.startsWith("Mushroom Matrix ")
				|| expectedSave.startsWith("Mushroom Abel Noelle "))) {
			throw new IllegalArgumentException(action + " requires a disposable test save");
		}
		if (!bool(state, "singleplayer", false) || !state.has("playerCount") || state.get("playerCount").getAsInt() != 1) {
			throw new IllegalArgumentException(action + " requires exactly one player in a single-player world");
		}
		return expectedSave;
	}

	private static String string(JsonObject body, String key) {
		return !body.has(key) || body.get(key).isJsonNull() ? "" : body.get(key).getAsString();
	}

	private static boolean bool(JsonObject body, String key, boolean fallback) {
		if (!body.has(key) || body.get(key).isJsonNull()) {
			return fallback;
		}
		return switch (body.get(key).getAsString().toLowerCase(Locale.ROOT)) {
			case "1", "true", "yes", "on" -> true;
			case "0", "false", "no", "off" -> false;
			default -> throw new IllegalArgumentException(key + " must be true or false");
		};
	}
}
