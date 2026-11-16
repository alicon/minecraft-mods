package dev.alicon.playtestbridge;

import com.google.gson.JsonParser;
import java.util.List;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class BridgeCraftingGridTest {
	@Test
	void preservesRowsAndExplicitEmptySlots() {
		var grid = BridgeCraftingGrid.parse(JsonParser.parseString("""
				{"width":3,"height":2,"slots":["minecraft:copper_ingot",null,"minecraft:copper_ingot",null,"minecraft:copper_ingot",null]}
				""").getAsJsonObject());
		assertEquals(3, grid.width());
		assertEquals(2, grid.height());
		assertEquals(List.of("minecraft:copper_ingot", "minecraft:air", "minecraft:copper_ingot", "minecraft:air", "minecraft:copper_ingot", "minecraft:air"), grid.slots());
	}

	@Test
	void rejectsInvalidDimensionsInsteadOfTruncating() {
		for (String width : List.of("0", "4", "1.5", "true", "null", "\"2\"", "900719925474099100000")) {
			assertThrows(IllegalArgumentException.class, () -> BridgeCraftingGrid.parse(JsonParser.parseString(
					"{\"width\":" + width + ",\"height\":1,\"slots\":[null]}").getAsJsonObject()));
		}
	}

	@Test
	void rejectsMalformedSlotsAndMissingRows() {
		for (String slots : List.of("[]", "[null,null]", "[3]", "[true]", "[{}]", "[\"stone\"]", "[\"minecraft:Stone\"]")) {
			assertThrows(IllegalArgumentException.class, () -> BridgeCraftingGrid.parse(JsonParser.parseString(
					"{\"width\":1,\"height\":1,\"slots\":" + slots + "}").getAsJsonObject()));
		}
	}
}
