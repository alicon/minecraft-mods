package dev.alicon.playtestbridge;

final class BridgeSettings {
	private static final int DEFAULT_PORT = 57321;

	private BridgeSettings() {
	}

	static boolean enabled() {
		return booleanValue("playtest.bridge.enabled", "PLAYTEST_BRIDGE_ENABLED", true);
	}

	static int port() {
		String configured = stringValue("playtest.bridge.port", "PLAYTEST_BRIDGE_PORT", Integer.toString(DEFAULT_PORT));
		try {
			int port = Integer.parseInt(configured);
			if (port < 1 || port > 65535) {
				PlaytestBridge.LOGGER.warn("Invalid playtest bridge port {}; using {}", configured, DEFAULT_PORT);
				return DEFAULT_PORT;
			}
			return port;
		} catch (NumberFormatException exception) {
			PlaytestBridge.LOGGER.warn("Invalid playtest bridge port {}; using {}", configured, DEFAULT_PORT);
			return DEFAULT_PORT;
		}
	}

	private static boolean booleanValue(String propertyName, String environmentName, boolean fallback) {
		String configured = stringValue(propertyName, environmentName, Boolean.toString(fallback));
		return switch (configured.toLowerCase()) {
			case "1", "true", "yes", "on" -> true;
			case "0", "false", "no", "off" -> false;
			default -> fallback;
		};
	}

	private static String stringValue(String propertyName, String environmentName, String fallback) {
		String property = System.getProperty(propertyName);
		if (property != null && !property.isBlank()) {
			return property.trim();
		}
		String environment = System.getenv(environmentName);
		if (environment != null && !environment.isBlank()) {
			return environment.trim();
		}
		return fallback;
	}
}
