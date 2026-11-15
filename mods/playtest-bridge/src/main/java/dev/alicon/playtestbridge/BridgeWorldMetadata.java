package dev.alicon.playtestbridge;

import com.google.gson.JsonObject;
import java.nio.file.Path;

/** World identity metadata uses exact decimal seeds across the Java/JavaScript boundary. */
final class BridgeWorldMetadata {
	private BridgeWorldMetadata() {
	}

	static void addTo(JsonObject state, long worldSeed, Path worldPath) {
		state.addProperty("seed", seed(worldSeed));
		Path savePath = worldPath.toAbsolutePath().normalize();
		state.addProperty("savePath", savePath.toString());
		Path saveName = savePath.getFileName();
		if (saveName != null) {
			state.addProperty("saveName", saveName.toString());
		}
	}

	static String seed(long worldSeed) {
		return Long.toString(worldSeed);
	}
}
