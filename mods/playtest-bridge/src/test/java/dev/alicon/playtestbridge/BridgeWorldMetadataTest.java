package dev.alicon.playtestbridge;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.nio.file.Path;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class BridgeWorldMetadataTest {
	@ParameterizedTest
	@ValueSource(longs = {Long.MIN_VALUE, -9007199254740993L, -1L, 0L, 9007199254740993L, Long.MAX_VALUE})
	void serializedSeedsPreserveAllSignedLongDigits(long seed) {
		JsonObject state = new JsonObject();
		BridgeWorldMetadata.addTo(state, seed, Path.of("test-saves", "Codex Seed Test", "."));
		JsonObject decoded = JsonParser.parseString(state.toString()).getAsJsonObject();
		assertTrue(decoded.getAsJsonPrimitive("seed").isString(), "JSON numeric seeds lose precision in JavaScript");
		assertEquals(seed, Long.parseLong(decoded.get("seed").getAsString()));
		assertEquals(BridgeWorldMetadata.seed(seed), decoded.get("seed").getAsString());
		assertEquals("Codex Seed Test", decoded.get("saveName").getAsString());
		assertEquals(Path.of("test-saves", "Codex Seed Test").toAbsolutePath().normalize().toString(),
				decoded.get("savePath").getAsString());
	}
}
