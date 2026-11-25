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
	private static final Set<String> ACTIONS = Set.of("start", "status", "cancel");
	private static final Set<String> MODES = Set.of("walk", "boat", "dismount", "jump");
	private static final Set<String> COMMON = Set.of("action", "expectedSave", "playerUuid", "operationId");
	private static final Set<String> START = Set.of("mode", "ticks", "forward", "backward", "left", "right", "vehicleUuid");

	static BridgeInputRequest parse(JsonObject state, JsonObject body) {
		String action = text(body, "action");
		if (!ACTIONS.contains(action)) {
			throw new IllegalArgumentException("client input action must be start, status or cancel");
		}
		boolean start = action.equals("start");
		for (String key : body.keySet()) {
			if (!COMMON.contains(key) && !(start && START.contains(key))) {
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
		if (!start) {
			return new BridgeInputRequest(action, save, playerUuid, id, "", 0, false, false, false, false, null, 0, 0, false);
		}
		return parseStart(state, body, players.get(0).getAsJsonObject(), save, playerUuid, id);
	}

	private static BridgeInputRequest parseStart(JsonObject state, JsonObject body, JsonObject player,
			String save, String playerUuid, String id) {
		String mode = text(body, "mode");
		if (!MODES.contains(mode)) {
			throw new IllegalArgumentException("input mode must be walk, boat, dismount or jump");
		}
		boolean dismount = mode.equals("dismount");
		String vehicleUuid = readVehicle(body, dismount || mode.equals("boat"));
		if (!state.has("worldFrozen") || state.get("worldFrozen").getAsBoolean()) {
			throw new IllegalArgumentException("client input requires running world ticks");
		}
		int ticks = readTicks(body);
		boolean forward = flag(body, "forward");
		boolean backward = flag(body, "backward");
		boolean left = flag(body, "left");
		boolean right = flag(body, "right");
		if (forward && backward || left && right) {
			throw new IllegalArgumentException("opposing input directions are unsupported");
		}
		if (dismount && (ticks < 2 || ticks > MAX_DISMOUNT_TICKS || forward || backward || left || right)) {
			throw new IllegalArgumentException("dismount input requires 2 to " + MAX_DISMOUNT_TICKS + " ticks without directional controls");
		}
		JumpSample jump = mode.equals("jump") ? readJumpSample(state, player, ticks) : JumpSample.NOT_READY;
		return new BridgeInputRequest("start", save, playerUuid, id, mode, ticks, forward, backward, left, right,
				vehicleUuid, jump.originY(), jump.millis(), jump.ready());
	}

	private static String readVehicle(JsonObject body, boolean riding) {
		if (riding) {
			String vehicleUuid = text(body, "vehicleUuid");
			UUID.fromString(vehicleUuid);
			return vehicleUuid;
		}
		if (body.has("vehicleUuid")) {
			throw new IllegalArgumentException("on-foot input cannot target a vehicle");
		}
		return null;
	}

	private static int readTicks(JsonObject body) {
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
		if (ticks < 1 || ticks > MAX_TICKS) {
			throw new IllegalArgumentException("input duration is out of bounds");
		}
		return ticks;
	}

	private static JumpSample readJumpSample(JsonObject state, JsonObject player, int ticks) {
		if (ticks < 2 || ticks > MAX_JUMP_TICKS) {
			throw new IllegalArgumentException("jump input requires 2 to " + MAX_JUMP_TICKS + " ticks");
		}
		double originY = 0;
		try {
			validateJumpStart(player);
			originY = player.getAsJsonObject("positionPrecise").get("y").getAsDouble();
			long millis = Long.parseLong(text(state, "inputObservationEndMillis"));
			return new JumpSample(originY, millis, true);
		} catch (RuntimeException invalidPhysics) {
			// Retries can return their existing receipt while airborne. New starts require a valid sample.
			return new JumpSample(originY, 0, false);
		}
	}

	private record JumpSample(double originY, long millis, boolean ready) {
		private static final JumpSample NOT_READY = new JumpSample(0, 0, false);
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
