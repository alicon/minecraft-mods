package dev.alicon.playtestbridge;

import com.google.gson.JsonObject;
import java.util.Locale;
import java.util.regex.Pattern;

/** Field readers for bridge endpoints that accept Gson's normal primitive coercions. */
final class BridgeJsonFields {
	private static final Pattern RESOURCE_ID = Pattern.compile("[a-z0-9_.-]+:[a-z0-9_./-]+");

	private BridgeJsonFields() {
	}

	static String requiredString(JsonObject object, String name) {
		if (!object.has(name) || !object.get(name).isJsonPrimitive()) {
			throw new IllegalArgumentException("missing string field: " + name);
		}
		String value = object.get(name).getAsString();
		if (value.isBlank()) {
			throw new IllegalArgumentException(name + " cannot be blank");
		}
		return value;
	}

	static String optionalString(JsonObject object, String name, String fallback) {
		if (!hasValue(object, name)) {
			return fallback;
		}
		return object.get(name).getAsString();
	}

	static int optionalInt(JsonObject object, String name, int fallback, int min, int max) {
		if (!hasValue(object, name)) {
			return fallback;
		}
		int value = object.get(name).getAsInt();
		if (value < min || value > max) {
			throw new IllegalArgumentException(name + " must be between " + min + " and " + max);
		}
		return value;
	}

	static double optionalDouble(JsonObject object, String name, double fallback, double min, double max) {
		if (!hasValue(object, name)) {
			return fallback;
		}
		double value = object.get(name).getAsDouble();
		if (!Double.isFinite(value) || value < min || value > max) {
			throw new IllegalArgumentException(name + " must be between " + min + " and " + max);
		}
		return value;
	}

	static double requiredDouble(JsonObject object, String name) {
		if (!hasValue(object, name)) {
			throw new IllegalArgumentException("missing number field: " + name);
		}
		double value = object.get(name).getAsDouble();
		if (!Double.isFinite(value)) {
			throw new IllegalArgumentException(name + " must be finite");
		}
		return value;
	}

	static boolean optionalBoolean(JsonObject object, String name, boolean fallback) {
		if (!hasValue(object, name)) {
			return fallback;
		}
		String value = object.get(name).getAsString().toLowerCase(Locale.ROOT);
		return switch (value) {
			case "1", "true", "yes", "on" -> true;
			case "0", "false", "no", "off" -> false;
			default -> throw new IllegalArgumentException(name + " must be true or false");
		};
	}

	static int requiredInt(JsonObject object, String name) {
		if (!hasValue(object, name)) {
			throw new IllegalArgumentException("missing integer field: " + name);
		}
		return object.get(name).getAsInt();
	}

	static int optionalInt(JsonObject object, String name, int fallback) {
		if (!hasValue(object, name)) {
			return fallback;
		}
		return object.get(name).getAsInt();
	}

	static String resourceId(String value, String name) {
		return resourceId(value, name, "minecraft:pig");
	}

	static String resourceId(String value, String name, String example) {
		if (!isResourceId(value)) {
			throw new IllegalArgumentException(name + " must be a namespaced id like " + example);
		}
		return value;
	}

	static boolean isResourceId(String value) {
		return RESOURCE_ID.matcher(value).matches();
	}

	private static boolean hasValue(JsonObject object, String name) {
		return object.has(name) && !object.get(name).isJsonNull();
	}
}
