package dev.alicon.playtestbridge;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import net.minecraft.commands.CommandSource;
import net.minecraft.network.chat.Component;

/** Keeps command diagnostics in the HTTP reply instead of flooding launcher stdout and operator chat. */
final class BridgeCommandOutput implements CommandSource {
	private static final int MAX_MESSAGES = 32;
	private static final int MAX_MESSAGE_CODE_POINTS = 2048;
	private final JsonArray messages = new JsonArray();
	private boolean truncated;

	@Override
	public void sendSystemMessage(Component message) {
		if (this.messages.size() >= MAX_MESSAGES) {
			this.truncated = true;
			return;
		}
		String text = message.getString();
		int codePoints = text.codePointCount(0, text.length());
		if (codePoints > MAX_MESSAGE_CODE_POINTS) {
			text = text.substring(0, text.offsetByCodePoints(0, MAX_MESSAGE_CODE_POINTS));
			this.truncated = true;
		}
		this.messages.add(text);
	}

	@Override
	public boolean acceptsSuccess() {
		return true;
	}

	@Override
	public boolean acceptsFailure() {
		return true;
	}

	@Override
	public boolean shouldInformAdmins() {
		return false;
	}

	void appendTo(JsonObject response) {
		response.add("feedback", this.messages.deepCopy());
		response.addProperty("feedbackTruncated", this.truncated);
	}
}
