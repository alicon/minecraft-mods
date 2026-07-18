package dev.alicon.mushroomyorkie;

final class MushroomOwnerTravelPolicy {
	private MushroomOwnerTravelPolicy() {
	}

	static boolean shouldFollow(boolean alive, boolean belongsToPlayer, boolean orderedToSit) {
		return alive && belongsToPlayer && !orderedToSit;
	}
}
