package dev.alicon.playtestbridge;

import com.google.gson.JsonObject;
import java.util.Set;
import java.util.UUID;

/** Closed request shape for short native input bursts in an identified disposable world. */
record BridgeInputRequest(String action, String expectedSave, String playerUuid, String operationId,
		String mode, int ticks, boolean forward, boolean backward, boolean left, boolean right, String vehicleUuid,
		double jumpServerOriginY, long jumpServerSampleMillis, boolean jumpServerReady) {
	static final int MAX_TICKS = 100;
	static final int MAX_DISMOUNT_TICKS = 5;
	static final int MAX_JUMP_TICKS = 5;
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
			return new BridgeInputRequest(action, save, playerUuid, id, "", 0, false, false, false, false, null, 0, 0, false);
		}
		String mode = text(body, "mode");
		if (!Set.of("walk", "boat", "dismount", "jump").contains(mode)) throw new IllegalArgumentException("input mode must be walk, boat, dismount or jump");
		String vehicleUuid = null;
		if (mode.equals("boat") || mode.equals("dismount")) {
			vehicleUuid = text(body, "vehicleUuid");
			UUID.fromString(vehicleUuid);
		} else if (body.has("vehicleUuid")) throw new IllegalArgumentException("on-foot input cannot target a vehicle");
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
		if (mode.equals("jump")) {
			if (ticks < 2 || ticks > MAX_JUMP_TICKS) throw new IllegalArgumentException("jump input requires 2 to " + MAX_JUMP_TICKS + " ticks");
		}
		double jumpOrigin = 0;long sampleMillis = 0;boolean ready = false;
		if (mode.equals("jump")) {
			try {
				validateJumpStart(players.get(0).getAsJsonObject());
				jumpOrigin = players.get(0).getAsJsonObject().getAsJsonObject("positionPrecise").get("y").getAsDouble();
				sampleMillis = Long.parseLong(text(state, "inputObservationEndMillis"));ready = true;
			} catch (RuntimeException invalidPhysics) {
				// An identical retry must still return its original receipt while airborne.
				// A new operation validates these facts before binding or writing any keys.
				ready = false;
			}
		}
		return new BridgeInputRequest(action, save, playerUuid, id, mode, ticks, forward, backward, left, right, vehicleUuid, jumpOrigin, sampleMillis, ready);
	}

	void validateNewStart() {
		if (this.mode.equals("jump") && !this.jumpServerReady) {
			throw new IllegalArgumentException("jump requires fresh grounded, dry, on-foot non-creative owner physics without hurt, climbing or effects");
		}
	}

	boolean sameControls(BridgeInputRequest other) {
		return this.action.equals(other.action) && this.expectedSave.equals(other.expectedSave) && this.playerUuid.equals(other.playerUuid)
				&& this.operationId.equals(other.operationId) && this.mode.equals(other.mode) && this.ticks == other.ticks
				&& this.forward == other.forward && this.backward == other.backward && this.left == other.left && this.right == other.right
				&& java.util.Objects.equals(this.vehicleUuid, other.vehicleUuid);
	}

	private static void validateJumpStart(JsonObject player) {
		JsonObject abilities = player.has("abilities") && player.get("abilities").isJsonObject() ? player.getAsJsonObject("abilities") : null;
		var health = player.get("health");
		var position = player.getAsJsonObject("positionPrecise");
		var hurt = player.get("hurtTime");
		if (player.has("vehicle") || !knownFlag(player, "onGround", true) || !knownFlag(player, "inWater", false)
				|| !knownFlag(player, "inWaterOrBubble", false) || !knownFlag(player, "onClimbable", false) || !knownFlag(player, "hasEffects", false)
				|| !knownFlag(player, "shiftKeyDown", false) || !knownFlag(abilities, "creative", false)
				|| !knownFlag(abilities, "spectator", false) || !knownFlag(abilities, "flying", false)
				|| health == null || !health.isJsonPrimitive() || !health.getAsJsonPrimitive().isNumber()
				|| !Double.isFinite(health.getAsDouble()) || health.getAsDouble() <= 0 || hurt == null || hurt.getAsInt() != 0
				|| position == null || !position.has("y") || !Double.isFinite(position.get("y").getAsDouble())) {
			throw new IllegalArgumentException("jump requires a grounded, dry, on-foot non-creative living owner with released Shift");
		}
	}

	private static boolean knownFlag(JsonObject object, String key, boolean expected) {
		if (object == null) return false;
		var value = object.get(key);
		return value != null && value.isJsonPrimitive() && value.getAsJsonPrimitive().isBoolean() && value.getAsBoolean() == expected;
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
		if (this.mode.equals("jump")) {
			result.addProperty("jumpServerOriginY", this.jumpServerOriginY);
			result.addProperty("jumpServerSampleMillis", Long.toString(this.jumpServerSampleMillis));
		}
		return result;
	}
}
