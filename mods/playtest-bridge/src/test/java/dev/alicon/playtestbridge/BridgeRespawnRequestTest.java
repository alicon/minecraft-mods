package dev.alicon.playtestbridge;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import org.junit.jupiter.api.Test;

class BridgeRespawnRequestTest {
	private static final String UUID = "11111111-1111-1111-1111-111111111111";

	private JsonObject body() {
		JsonObject body = new JsonObject();
		body.addProperty("expectedSave", "Codex Respawn");body.addProperty("playerUuid", UUID);
		return body;
	}

	private JsonObject state() {
		JsonObject state = new JsonObject();
		state.addProperty("saveName", "Codex Respawn");state.addProperty("singleplayer", true);state.addProperty("playerCount", 1);
		state.addProperty("hardcore", false);
		JsonObject player = new JsonObject();
		player.addProperty("uuid", UUID);player.addProperty("health", 0);
		player.addProperty("dimension", "ResourceKey[minecraft:dimension / minecraft:overworld]");
		JsonArray players = new JsonArray();players.add(player);state.add("players", players);
		return state;
	}

	@Test
	void capturesExactDeadOwnerContext() {
		BridgeRespawnRequest request = BridgeRespawnRequest.parse(this.state(), this.body());
		assertEquals(UUID, request.playerUuid());assertEquals("Codex Respawn", request.expectedSave());
		assertEquals("ResourceKey[minecraft:dimension / minecraft:overworld]", request.dimension());
	}

	@Test
	void refusesLivingOrInvalidHealth() {
		for (double health : new double[] {20, 1, -1, Double.NaN, Double.POSITIVE_INFINITY}) {
			JsonObject state = this.state();state.getAsJsonArray("players").get(0).getAsJsonObject().addProperty("health", health);
			assertThrows(IllegalArgumentException.class, () -> BridgeRespawnRequest.parse(state, this.body()));
		}
	}

	@Test
	void rejectsWrongSavePlayerAndUnknownOrNonStringKeys() {
		for (String fault : new String[] {"save", "uuid", "unknown", "missing", "typed", "malformed"}) {
			JsonObject body = this.body();
			if (fault.equals("save")) body.addProperty("expectedSave", "Codex Other");
			if (fault.equals("uuid")) body.addProperty("playerUuid", "22222222-2222-2222-2222-222222222222");
			if (fault.equals("unknown")) body.addProperty("health", 20);
			if (fault.equals("missing")) body.remove("playerUuid");
			if (fault.equals("typed")) body.addProperty("expectedSave", true);
			if (fault.equals("malformed")) body.addProperty("playerUuid", "not-a-uuid");
			assertThrows(IllegalArgumentException.class, () -> BridgeRespawnRequest.parse(this.state(), body));
		}
	}

	@Test
	void refusesNonDisposableOrMultiplayerContexts() {
		for (String fault : new String[] {"family", "multiplayer", "count", "players", "hardcore", "unknown-hardcore"}) {
			JsonObject state = this.state(), body = this.body();
			if (fault.equals("family")) { state.addProperty("saveName", "Family");body.addProperty("expectedSave", "Family"); }
			if (fault.equals("multiplayer")) state.addProperty("singleplayer", false);
			if (fault.equals("count")) state.addProperty("playerCount", 2);
			if (fault.equals("hardcore")) state.addProperty("hardcore", true);
			if (fault.equals("unknown-hardcore")) state.remove("hardcore");
			if (fault.equals("players")) state.getAsJsonArray("players").add(state.getAsJsonArray("players").get(0).deepCopy());
			assertThrows(IllegalArgumentException.class, () -> BridgeRespawnRequest.parse(state, body));
		}
	}
}
