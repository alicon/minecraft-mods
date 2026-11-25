package dev.alicon.playtestbridge;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import java.util.ArrayList;
import java.util.List;

/** A bounded synthetic grid for read-only native recipe resolution, never an inventory mutation. */
record BridgeCraftingGrid(int width, int height, List<String> slots) {

	static BridgeCraftingGrid parse(JsonObject body) {
		int width = dimension(body, "width");
		int height = dimension(body, "height");
		if (!body.has("slots") || !body.get("slots").isJsonArray() || body.getAsJsonArray("slots").size() != width * height) {
			throw new IllegalArgumentException("slots must have exactly width * height entries");
		}
		List<String> slots = new ArrayList<>();
		for (JsonElement entry : body.getAsJsonArray("slots")) {
			if (entry.isJsonNull()) {
				slots.add("minecraft:air");
			} else if (entry.isJsonPrimitive() && entry.getAsJsonPrimitive().isString() && BridgeJsonFields.isResourceId(entry.getAsString())) {
				slots.add(entry.getAsString());
			} else {
				throw new IllegalArgumentException("Each slot must be a namespaced item id or null");
			}
		}
		return new BridgeCraftingGrid(width, height, List.copyOf(slots));
	}

	private static int dimension(JsonObject body, String name) {
		if (!body.has(name) || !body.get(name).isJsonPrimitive() || !body.getAsJsonPrimitive(name).isNumber()) {
			throw new IllegalArgumentException(name + " must be an integer from 1 to 3");
		}
		try {
			int value = body.getAsJsonPrimitive(name).getAsBigDecimal().intValueExact();
			if (value >= 1 && value <= 3) {
				return value;
			}
		} catch (ArithmeticException ignored) {
			// Fractions and overflow are invalid dimensions, never silently truncated.
		}
		throw new IllegalArgumentException(name + " must be an integer from 1 to 3");
	}
}
