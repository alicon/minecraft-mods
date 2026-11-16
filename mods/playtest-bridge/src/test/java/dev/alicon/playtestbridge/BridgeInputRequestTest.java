package dev.alicon.playtestbridge;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.junit.jupiter.api.Test;

class BridgeInputRequestTest {
	static final String PLAYER = "494f67d1-2009-4c26-bfcb-c41a89adaf80";

	static JsonObject state() {
		JsonObject state = new JsonObject();
		state.addProperty("saveName", "Codex Input Test");
		state.addProperty("singleplayer", true);
		state.addProperty("playerCount", 1);
		state.addProperty("worldFrozen", false);
		JsonObject player = new JsonObject();
		player.addProperty("uuid", PLAYER);
		JsonArray players = new JsonArray();
		players.add(player);
		state.add("players", players);
		return state;
	}

	static JsonObject body() {
		JsonObject body = JsonParser.parseString("""
				{"action":"start","expectedSave":"Codex Input Test",
				 "playerUuid":"494f67d1-2009-4c26-bfcb-c41a89adaf80","mode":"boat","ticks":20,"forward":true,
				 "vehicleUuid":"00000000-0000-0000-0000-000000000001"}
				""").getAsJsonObject();
		body.addProperty("operationId", java.util.UUID.randomUUID().toString());
		return body;
	}

	static JsonObject jumpState() {
		JsonObject state = state(), player = state.getAsJsonArray("players").get(0).getAsJsonObject();
		player.addProperty("health", 20);player.addProperty("onGround", true);player.addProperty("inWater", false);player.addProperty("shiftKeyDown", false);
		JsonObject abilities = new JsonObject();
		for (String key : new String[] {"creative", "spectator", "flying"}) abilities.addProperty(key, false);
		player.add("abilities", abilities);
		for (String key : new String[] {"inWaterOrBubble", "onClimbable", "hasEffects"}) player.addProperty(key, false);
		player.addProperty("hurtTime", 0);
		JsonObject position = new JsonObject();position.addProperty("y", 220);player.add("positionPrecise", position);
		state.addProperty("inputObservationEndMillis", "0");
		return state;
	}

	static JsonObject jumpBody() {
		JsonObject body = body();body.addProperty("mode", "jump");body.addProperty("ticks", 2);body.remove("vehicleUuid");return body;
	}

	@Test
	void jumpAllowsAShortOnFootForwardBurstButNoVehicleOrLongHold() {
		assertEquals("jump", BridgeInputRequest.parse(jumpState(), jumpBody()).mode());
		for (int ticks : new int[] {1, 6}) {
			JsonObject body = jumpBody();body.addProperty("ticks", ticks);
			assertThrows(IllegalArgumentException.class, () -> BridgeInputRequest.parse(jumpState(), body));
		}
		JsonObject vehicle = jumpBody();vehicle.addProperty("vehicleUuid", "00000000-0000-0000-0000-000000000001");
		assertThrows(IllegalArgumentException.class, () -> BridgeInputRequest.parse(jumpState(), vehicle));
	}

	@Test
	void jumpRefusesUnsupportedOrUnknownStartingPhysics() {
		for (String fault : new String[] {"airborne", "water", "shift", "dead", "creative", "spectator", "flying", "vehicle", "unknown-ground", "unknown-mode", "hurt", "climb", "effects", "bubble", "unknown-position"}) {
			JsonObject state = jumpState(), player = state.getAsJsonArray("players").get(0).getAsJsonObject();
			if (fault.equals("airborne")) player.addProperty("onGround", false);
			if (fault.equals("water")) player.addProperty("inWater", true);
			if (fault.equals("shift")) player.addProperty("shiftKeyDown", true);
			if (fault.equals("dead")) player.addProperty("health", 0);
			if (java.util.Set.of("creative", "spectator", "flying").contains(fault)) player.getAsJsonObject("abilities").addProperty(fault, true);
			if (fault.equals("vehicle")) player.add("vehicle", new JsonObject());
			if (fault.equals("unknown-ground")) player.remove("onGround");
			if (fault.equals("unknown-mode")) player.remove("abilities");
			if (fault.equals("hurt")) player.addProperty("hurtTime", 10);
			if (fault.equals("climb")) player.addProperty("onClimbable", true);
			if (fault.equals("effects")) player.addProperty("hasEffects", true);
			if (fault.equals("bubble")) player.addProperty("inWaterOrBubble", true);
			if (fault.equals("unknown-position")) player.remove("positionPrecise");
			assertThrows(IllegalArgumentException.class, () -> BridgeInputRequest.parse(state, jumpBody()).validateNewStart(), fault);
		}
	}

	@Test
	void boundedIdleAndDirectionalBurstsAreExplicit() {
		assertEquals(20, BridgeInputRequest.parse(state(), body()).ticks());
		JsonObject body = body();
		body.addProperty("forward", false);
		body.addProperty("ticks", 100);
		assertFalse(BridgeInputRequest.parse(state(), body).forward());
	}

	@Test
	void rejectsDurationsThatCouldOutliveOrMisrepresentTheRequestedBurst() {
		for (String duration : new String[] {"0", "101", "-1", "1.5", "true", "\"20\"", "null", "1e100"}) {
			JsonObject body = body();
			body.add("ticks", JsonParser.parseString(duration));
			assertThrows(IllegalArgumentException.class, () -> BridgeInputRequest.parse(state(), body), duration);
		}
	}

	@Test
	void refusesWrongWorldPlayerFrozenPhysicsAndUnknownControls() {
		JsonObject state = state(), body = body();
		state.addProperty("worldFrozen", true);
		assertThrows(IllegalArgumentException.class, () -> BridgeInputRequest.parse(state, body));
		state.addProperty("worldFrozen", false);
		body.addProperty("playerUuid", "00000000-0000-0000-0000-000000000000");
		assertThrows(IllegalArgumentException.class, () -> BridgeInputRequest.parse(state, body));
		body.addProperty("playerUuid", PLAYER);
		body.addProperty("expectedSave", "Family Save");
		assertThrows(IllegalArgumentException.class, () -> BridgeInputRequest.parse(state, body));
		body.addProperty("expectedSave", "Codex Input Test");
		body.addProperty("jump", true);
		assertThrows(IllegalArgumentException.class, () -> BridgeInputRequest.parse(state, body));
	}

	@Test
	void rejectsAmbiguousDirectionValuesAndRequiresAnOperationForCancellation() {
		for (String value : new String[] {"\"true\"", "1", "null"}) {
			JsonObject body = body();
			body.add("left", JsonParser.parseString(value));
			assertThrows(IllegalArgumentException.class, () -> BridgeInputRequest.parse(state(), body));
		}
		JsonObject body = body();
		body.addProperty("backward", true);
		assertThrows(IllegalArgumentException.class, () -> BridgeInputRequest.parse(state(), body));
		JsonObject cancel = new JsonObject();
		cancel.addProperty("action", "cancel");
		cancel.addProperty("expectedSave", "Codex Input Test");
		cancel.addProperty("playerUuid", PLAYER);
		assertThrows(IllegalArgumentException.class, () -> BridgeInputRequest.parse(state(), cancel));
		cancel.addProperty("operationId", java.util.UUID.randomUUID().toString());
		assertEquals("cancel", BridgeInputRequest.parse(state(), cancel).action());
	}

	@Test
	void dismountTargetsOneVehicleForAShortNeutralDirectionalBurst() {
		JsonObject body = body();
		body.addProperty("mode", "dismount");
		body.addProperty("forward", false);
		body.addProperty("ticks", 2);
		assertEquals("dismount", BridgeInputRequest.parse(state(), body).mode());
		body.addProperty("ticks", 1);
		assertThrows(IllegalArgumentException.class, () -> BridgeInputRequest.parse(state(), body));
		body.addProperty("ticks", 6);
		assertThrows(IllegalArgumentException.class, () -> BridgeInputRequest.parse(state(), body));
		body.addProperty("ticks", 2);
		for (String direction : new String[] {"forward", "backward", "left", "right"}) {
			body.addProperty(direction, true);
			assertThrows(IllegalArgumentException.class, () -> BridgeInputRequest.parse(state(), body));
			body.addProperty(direction, false);
		}
		body.remove("vehicleUuid");
		assertThrows(IllegalArgumentException.class, () -> BridgeInputRequest.parse(state(), body));
	}
}
