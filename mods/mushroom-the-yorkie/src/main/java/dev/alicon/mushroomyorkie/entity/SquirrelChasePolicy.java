package dev.alicon.mushroomyorkie.entity;

final class SquirrelChasePolicy {
	static final int MAX_CHASE_TICKS = 20 * 30;
	static final double MAX_PLAYER_DISTANCE_SQR = 24.0D * 24.0D;

	private SquirrelChasePolicy() {
	}

	static boolean shouldGiveUp(int chaseTicks, boolean foundTree, double playerDistanceSqr) {
		return chaseTicks >= MAX_CHASE_TICKS || !foundTree && playerDistanceSqr > MAX_PLAYER_DISTANCE_SQR;
	}
}
