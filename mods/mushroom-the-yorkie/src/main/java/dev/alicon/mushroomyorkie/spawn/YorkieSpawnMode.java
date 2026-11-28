package dev.alicon.mushroomyorkie.spawn;

/** Configurable wake-up spawning behavior for a player's Mushroom companion. */
public enum YorkieSpawnMode {
	/** Spawn a replacement after sleep when the player no longer has a known living Mushroom. */
	RESPAWN,
	/** Spawn only once per player; if Mushroom dies, that player does not get another one. */
	EXTREME;

	/**
	 * Parses a config value into a spawn mode, defaulting safely for kid-friendly play.
	 *
	 * @param value config value such as `respawn` or `extreme`
	 * @return parsed mode, or `RESPAWN` when the value is unknown
	 */
	public static YorkieSpawnMode fromConfigValue(String value) {
		if (value == null) {
			return RESPAWN;
		}

		for (YorkieSpawnMode mode : values()) {
			if (mode.name().equalsIgnoreCase(value)) {
				return mode;
			}
		}

		return RESPAWN;
	}

	/**
	 * Serializes this mode for the config file.
	 *
	 * @return lowercase config value
	 */
	public String configValue() {
		return this.name().toLowerCase(java.util.Locale.ROOT);
	}
}
