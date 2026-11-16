package dev.alicon.playtestbridge;

import com.google.gson.JsonObject;
import java.util.Set;
import java.util.UUID;

/** Explicit fixture recovery identity; a dead snapshot is required before client dispatch. */
record BridgeRespawnRequest(String expectedSave, String playerUuid, String dimension) {
	static BridgeRespawnRequest parse(JsonObject state, JsonObject body) {
		if (!body.keySet().equals(Set.of("expectedSave", "playerUuid"))) {
			throw new IllegalArgumentException("respawn requires only expectedSave and playerUuid");
		}
		for (String key : body.keySet()) {
			if (!body.get(key).isJsonPrimitive() || !body.getAsJsonPrimitive(key).isString()) {
				throw new IllegalArgumentException("respawn identity must be strings");
			}
		}
		String save = BridgeClientRequests.validateQuit(state, body);
		if (!state.has("hardcore") || !state.get("hardcore").isJsonPrimitive()
				|| !state.getAsJsonPrimitive("hardcore").isBoolean() || state.get("hardcore").getAsBoolean()) {
			throw new IllegalArgumentException("respawn requires a verified non-hardcore test world");
		}
		String uuid = body.get("playerUuid").getAsString();
		if (!UUID.fromString(uuid).toString().equals(uuid)) throw new IllegalArgumentException("invalid respawn player UUID");
		if (state.getAsJsonArray("players").size() != 1) throw new IllegalArgumentException("respawn requires one player");
		JsonObject player = state.getAsJsonArray("players").get(0).getAsJsonObject();
		if (!uuid.equals(player.get("uuid").getAsString())) throw new IllegalArgumentException("respawn player changed");
		double health = player.get("health").getAsDouble();
		if (!Double.isFinite(health) || health != 0) throw new IllegalArgumentException("respawn requires a dead server player");
		return new BridgeRespawnRequest(save, uuid, player.get("dimension").getAsString());
	}
}
