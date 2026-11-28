package dev.alicon.mushroomyorkie.spawn;

/** Pure rules for deciding whether a player should receive Mushroom after waking up. */
public final class YorkieSpawnPolicy {
	private YorkieSpawnPolicy() {
	}

	/**
	 * Decides whether to spawn a player's Mushroom companion after waking.
	 *
	 * @param mode configured spawn mode
	 * @param successfulSleep true when the wake-up appears to be from a successful night in bed
	 * @param hasLivingYorkie true when the player already has a known living Mushroom
	 * @param hasReceivedYorkie true when the player has previously received Mushroom
	 * @return true when a new Mushroom should be spawned for the player
	 */
	public static boolean shouldSpawn(YorkieSpawnMode mode, boolean successfulSleep, boolean hasLivingYorkie, boolean hasReceivedYorkie) {
		if (!successfulSleep || hasLivingYorkie) {
			return false;
		}

		return switch (mode) {
			case RESPAWN -> true;
			case EXTREME -> !hasReceivedYorkie;
		};
	}
}
