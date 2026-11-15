package dev.alicon.playtestbridge;

import com.google.gson.JsonObject;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

/** Client requests stay separate from world mutations and validate before dispatch. */
final class BridgeClientRequests {
	private BridgeClientRequests() {
	}

	static JsonObject screenshot(JsonObject body) throws Exception {
		String name = string(body, "name");
		return BridgeClientHooks.captureScreenshot(name, bool(body, "resume", true),
				bool(body, "hideGui", false), bool(body, "clearChat", false)).get(10, TimeUnit.SECONDS);
	}

	static JsonObject quit(JsonObject state, JsonObject body) throws Exception {
		String expectedSave = validateQuit(state, body);
		return BridgeClientHooks.requestQuit(expectedSave).get(10, TimeUnit.SECONDS);
	}

	static String validateQuit(JsonObject state, JsonObject body) {
		String expectedSave = string(body, "expectedSave");
		if (expectedSave.isEmpty() || !expectedSave.equals(string(state, "saveName"))) {
			throw new IllegalArgumentException("quit requires the exact expectedSave name");
		}
		if (!(expectedSave.startsWith("Codex ") || expectedSave.startsWith("Mushroom Matrix ")
				|| expectedSave.startsWith("Mushroom Abel Noelle "))) {
			throw new IllegalArgumentException("quit requires a disposable test save");
		}
		if (!bool(state, "singleplayer", false) || !state.has("playerCount") || state.get("playerCount").getAsInt() != 1) {
			throw new IllegalArgumentException("quit requires exactly one player in a single-player world");
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
