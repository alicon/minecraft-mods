package dev.alicon.playtestbridge;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonObject;
import org.junit.jupiter.api.Test;

class BridgeClientRequestsTest {
	@Test
	void failedDiagnosticSnapshotDoesNotReplaceTheInputReceiptWithAnException() {
		var future = new java.util.concurrent.CompletableFuture<JsonObject>();
		future.completeExceptionally(new IllegalStateException("private diagnostic detail"));
		var result = BridgeClientRequests.awaitInputTrace(future, 0);
		assertEquals("unavailable", result.get("status").getAsString());
		assertFalse(result.get("coverageComplete").getAsBoolean());
		assertFalse(result.toString().contains("private diagnostic detail"));
	}

	@Test
	void timedOutReadOnlySnapshotIsCancelledAndSuccessfulSnapshotsArePreserved() {
		var future = new java.util.concurrent.CompletableFuture<JsonObject>();
		assertEquals("unavailable", BridgeClientRequests.awaitInputTrace(future, 0).get("status").getAsString());
		assertTrue(future.isCancelled());
		JsonObject original = new JsonObject();original.addProperty("status", "available");
		assertEquals(original, BridgeClientRequests.awaitInputTrace(java.util.concurrent.CompletableFuture.completedFuture(original), 0));
	}

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
