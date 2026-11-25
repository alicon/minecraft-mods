package dev.alicon.playtestbridge;

import static dev.alicon.playtestbridge.BridgeJsonFields.optionalBoolean;

import com.google.gson.JsonObject;
import net.minecraft.server.level.ServerPlayer;

final class BridgePlayerActions {
	private BridgePlayerActions() {
	}

	static JsonObject updateAbilities(ServerPlayer player, JsonObject body) {
		player.getAbilities().flying = optionalBoolean(body, "flying", player.getAbilities().flying);
		player.getAbilities().mayfly = optionalBoolean(body, "mayfly", player.getAbilities().mayfly);
		player.onUpdateAbilities();

		JsonObject response = new JsonObject();
		response.addProperty("ok", true);
		response.addProperty("player", player.getGameProfile().name());
		response.add("abilities", BridgeEntityState.playerAbilities(player));
		return response;
	}
}
