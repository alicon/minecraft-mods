package dev.alicon.mushroomyorkie.entity;

import net.minecraft.core.BlockPos;

public final class MushroomLostRecoveryPolicy {
	static final long LOST_OWNER_TICKS = 24_000L;
	private static final int NEAR_RESPAWN_BLOCKS = 48;

	private MushroomLostRecoveryPolicy() {
	}

	public static boolean shouldRecover(long currentGameTime, long lastOwnerContactGameTime, boolean nearRespawnPoint) {
		return !nearRespawnPoint && currentGameTime - Math.max(0L, lastOwnerContactGameTime) >= LOST_OWNER_TICKS;
	}

	public static boolean nearRespawnPoint(BlockPos yorkiePos, BlockPos respawnPos) {
		return yorkiePos.distSqr(respawnPos) <= NEAR_RESPAWN_BLOCKS * NEAR_RESPAWN_BLOCKS;
	}
}
