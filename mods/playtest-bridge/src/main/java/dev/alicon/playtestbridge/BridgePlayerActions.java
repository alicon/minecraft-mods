package dev.alicon.playtestbridge;

import com.google.gson.JsonObject;
import java.util.Locale;
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

	private static boolean optionalBoolean(JsonObject object, String name, boolean fallback) {
		if (!object.has(name) || object.get(name).isJsonNull()) {
			return fallback;
		}
		String value = object.get(name).getAsString().toLowerCase(Locale.ROOT);
		return switch (value) {
			case "1", "true", "yes", "on" -> true;
			case "0", "false", "no", "off" -> false;
			default -> throw new IllegalArgumentException(name + " must be true or false");
		};
	}
}
