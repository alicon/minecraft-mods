package dev.alicon.playtestbridge;

import static dev.alicon.playtestbridge.BridgeJsonFields.optionalBoolean;
import static dev.alicon.playtestbridge.BridgeJsonFields.optionalString;

import com.google.gson.JsonObject;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.CompletableFuture;
import java.util.function.Supplier;
import net.minecraft.server.MinecraftServer;

/** Client requests stay separate from world mutations and validate before dispatch. */
final class BridgeClientRequests {
	private BridgeClientRequests() {
	}

	static JsonObject screenshot(JsonObject body) throws Exception {
		String name = optionalString(body, "name", "");
		return BridgeClientHooks.captureScreenshot(name, optionalBoolean(body, "resume", true),
				optionalBoolean(body, "hideGui", false), optionalBoolean(body, "clearChat", false)).get(10, TimeUnit.SECONDS);
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

	static JsonObject input(MinecraftServer server, JsonObject state, JsonObject body) throws Exception {
		BridgeInputRequest request = BridgeInputRequest.parse(state, body);
		BridgeNativeInputTrace.arm(server, request);
		var future = BridgeClientHooks.input(request);
		try {
			JsonObject response = future.get(5, TimeUnit.SECONDS);
			response.add("serverSnapshot", state);
			long started = Long.parseLong(response.get("startedMillis").getAsString());
			try {
				response.add("serverInputTrace", awaitInputTrace(server.submit(() -> BridgeNativeInputTrace.snapshot(server, request, started)), 5000));
			} catch (RuntimeException observerUnavailable) {
				response.add("serverInputTrace", unavailableInputTrace());
			}
			return response;
		} catch (Exception failure) {
			future.cancel(false);
			throw failure;
		}
	}

	static JsonObject awaitInputTrace(CompletableFuture<JsonObject> trace, long timeoutMillis) {
		try { return trace.get(timeoutMillis, TimeUnit.MILLISECONDS); }
		catch (Exception observerUnavailable) { trace.cancel(false);return unavailableInputTrace(); }
	}

	private static JsonObject unavailableInputTrace() {
		JsonObject result = new JsonObject();result.addProperty("status", "unavailable");
		result.addProperty("coverageComplete", false);result.addProperty("observationFailed", true);
		result.addProperty("scopeMatches", false);result.add("events", new com.google.gson.JsonArray());
		return result;
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
		String expectedSave = optionalString(body, "expectedSave", "");
		if (expectedSave.isEmpty() || !expectedSave.equals(optionalString(state, "saveName", ""))) {
			throw new IllegalArgumentException(action + " requires the exact expectedSave name");
		}
		if (!(expectedSave.startsWith("Codex ") || expectedSave.startsWith("Mushroom Matrix ")
				|| expectedSave.startsWith("Mushroom Abel Noelle "))) {
			throw new IllegalArgumentException(action + " requires a disposable test save");
		}
		if (!optionalBoolean(state, "singleplayer", false) || !state.has("playerCount") || state.get("playerCount").getAsInt() != 1) {
			throw new IllegalArgumentException(action + " requires exactly one player in a single-player world");
		}
		return expectedSave;
	}
}
