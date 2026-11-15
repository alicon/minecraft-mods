package dev.alicon.playtestbridge;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonObject;
import net.minecraft.network.chat.Component;
import org.junit.jupiter.api.Test;

class BridgeCommandOutputTest {
	@Test
	void preservesReadableErrorsAndSuccessWithoutOperatorBroadcasts() {
		BridgeCommandOutput output = new BridgeCommandOutput();
		assertTrue(output.acceptsFailure());
		assertTrue(output.acceptsSuccess());
		assertFalse(output.shouldInformAdmins());
		output.sendSystemMessage(Component.literal("Unknown or incomplete command"));
		output.sendSystemMessage(Component.literal("Set the time to 1000"));
		JsonObject response = new JsonObject();
		output.appendTo(response);
		assertEquals("Unknown or incomplete command", response.getAsJsonArray("feedback").get(0).getAsString());
		assertEquals("Set the time to 1000", response.getAsJsonArray("feedback").get(1).getAsString());
		assertFalse(response.get("feedbackTruncated").getAsBoolean());
		output.sendSystemMessage(Component.literal("late feedback"));
		assertEquals(2, response.getAsJsonArray("feedback").size(), "An HTTP snapshot must not mutate after serialization");
	}

	@Test
	void largeAndNumerousCommandMessagesRemainBoundedWithoutBreakingUnicode() {
		BridgeCommandOutput output = new BridgeCommandOutput();
		output.sendSystemMessage(Component.literal("🐶".repeat(10000)));
		for (int index = 0; index < 1000; index++) {
			output.sendSystemMessage(Component.literal("extra"));
		}
		JsonObject response = new JsonObject();
		output.appendTo(response);
		assertTrue(response.get("feedbackTruncated").getAsBoolean());
		assertEquals(32, response.getAsJsonArray("feedback").size());
		assertEquals("🐶".repeat(2048), response.getAsJsonArray("feedback").get(0).getAsString());
	}
}
