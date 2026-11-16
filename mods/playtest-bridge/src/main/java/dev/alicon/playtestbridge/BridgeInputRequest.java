package dev.alicon.playtestbridge;

import com.google.gson.JsonObject;
import java.util.Set;
import java.util.UUID;

/** Closed request shape for short native input bursts in an identified disposable world. */
record BridgeInputRequest(String action, String expectedSave, String playerUuid, String operationId,
		String mode, int ticks, boolean forward, boolean backward, boolean left, boolean right, String vehicleUuid) {
	static final int MAX_TICKS = 100;
	static final int MAX_DISMOUNT_TICKS = 5;
	private static final Set<String> COMMON = Set.of("action", "expectedSave", "playerUuid", "operationId");
	private static final Set<String> START = Set.of("mode", "ticks", "forward", "backward", "left", "right", "vehicleUuid");

	static BridgeInputRequest parse(JsonObject state, JsonObject body) {
		String action = text(body, "action");
		if (!Set.of("start", "status", "cancel").contains(action)) {
			throw new IllegalArgumentException("client input action must be start, status or cancel");
		}
		for (String key : body.keySet()) {
			if (!COMMON.contains(key) && !(action.equals("start") && START.contains(key))) {
				throw new IllegalArgumentException("unsupported client input field: " + key);
			}
		}
		String save = BridgeClientRequests.validateTestWorld(state, body, "client input");
		String playerUuid = text(body, "playerUuid");
		UUID.fromString(playerUuid);
		var players = state.getAsJsonArray("players");
		if (players == null || players.size() != 1
				|| !playerUuid.equals(text(players.get(0).getAsJsonObject(), "uuid"))) {
			throw new IllegalArgumentException("client input requires the original playerUuid");
		}
		String id = text(body, "operationId");
		UUID.fromString(id);
		if (!action.equals("start")) {
			return new BridgeInputRequest(action, save, playerUuid, id, "", 0, false, false, false, false, null);
		}
		String mode = text(body, "mode");
		if (!Set.of("walk", "boat", "dismount").contains(mode)) throw new IllegalArgumentException("input mode must be walk, boat or dismount");
		String vehicleUuid = null;
		if (!mode.equals("walk")) {
			vehicleUuid = text(body, "vehicleUuid");
			UUID.fromString(vehicleUuid);
		} else if (body.has("vehicleUuid")) throw new IllegalArgumentException("walk input cannot target a vehicle");
		if (!state.has("worldFrozen") || state.get("worldFrozen").getAsBoolean()) {
			throw new IllegalArgumentException("client input requires running world ticks");
		}
		var duration = body.get("ticks");
		int ticks;
		try {
			if (duration == null || !duration.isJsonPrimitive() || !duration.getAsJsonPrimitive().isNumber()) {
				throw new IllegalArgumentException();
			}
			ticks = duration.getAsBigDecimal().intValueExact();
		} catch (RuntimeException failure) {
			throw new IllegalArgumentException("input ticks must be an integer between 1 and " + MAX_TICKS);
		}
		if (ticks < 1 || ticks > MAX_TICKS) throw new IllegalArgumentException("input duration is out of bounds");
		boolean forward = flag(body, "forward"), backward = flag(body, "backward");
		boolean left = flag(body, "left"), right = flag(body, "right");
		if (forward && backward || left && right) throw new IllegalArgumentException("opposing input directions are unsupported");
		if (mode.equals("dismount") && (ticks < 2 || ticks > MAX_DISMOUNT_TICKS || forward || backward || left || right)) {
			throw new IllegalArgumentException("dismount input requires 2 to " + MAX_DISMOUNT_TICKS + " ticks without directional controls");
		}
		return new BridgeInputRequest(action, save, playerUuid, id, mode, ticks, forward, backward, left, right, vehicleUuid);
	}

	private static boolean flag(JsonObject object, String key) {
		if (!object.has(key)) return false;
		var value = object.get(key);
		if (!value.isJsonPrimitive() || !value.getAsJsonPrimitive().isBoolean()) {
			throw new IllegalArgumentException(key + " must be a Boolean");
		}
		return value.getAsBoolean();
	}

	private static String text(JsonObject object, String key) {
		var value = object.get(key);
		if (value == null || !value.isJsonPrimitive() || !value.getAsJsonPrimitive().isString() || value.getAsString().isBlank()) {
			throw new IllegalArgumentException("missing string field: " + key);
		}
		return value.getAsString();
	}

	JsonObject describe() {
		JsonObject result = new JsonObject();
		result.addProperty("expectedSave", this.expectedSave);
		result.addProperty("playerUuid", this.playerUuid);
		result.addProperty("mode", this.mode);
		if (this.vehicleUuid != null) result.addProperty("vehicleUuid", this.vehicleUuid);
		result.addProperty("ticks", this.ticks);
		result.addProperty("forward", this.forward);
		result.addProperty("backward", this.backward);
		result.addProperty("left", this.left);
		result.addProperty("right", this.right);
		return result;
	}
}
