package dev.alicon.playtestbridge;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.google.gson.JsonObject;
import org.junit.jupiter.api.Test;

class BridgeClientRequestsTest {
	@Test
	void quitRequiresAnExactDisposableSinglePlayerSave() {
		JsonObject state = new JsonObject();
		state.addProperty("saveName", "Codex Quit Test");
		state.addProperty("singleplayer", true);
		state.addProperty("playerCount", 1);
		JsonObject body = new JsonObject();
		assertThrows(IllegalArgumentException.class, () -> BridgeClientRequests.validateQuit(state, body));
		body.addProperty("expectedSave", "wrong");
		assertThrows(IllegalArgumentException.class, () -> BridgeClientRequests.validateQuit(state, body));
		body.addProperty("expectedSave", "Codex Quit Test");
		assertEquals("Codex Quit Test", BridgeClientRequests.validateQuit(state, body));
		state.addProperty("playerCount", 2);
		assertThrows(IllegalArgumentException.class, () -> BridgeClientRequests.validateQuit(state, body));
		state.addProperty("playerCount", 1);
		state.addProperty("singleplayer", false);
		assertThrows(IllegalArgumentException.class, () -> BridgeClientRequests.validateQuit(state, body));
		state.addProperty("singleplayer", true);
		state.addProperty("saveName", "Family Save");
		body.addProperty("expectedSave", "Family Save");
		assertThrows(IllegalArgumentException.class, () -> BridgeClientRequests.validateQuit(state, body));
	}
}
