package dev.alicon.mushroomyorkie.entity;

import net.minecraft.core.BlockPos;

/** Pure rules for teleporting a lost Mushroom back to the owner without depending on world state. */
public final class MushroomLostRecoveryPolicy {
	static final long LOST_OWNER_TICKS = 24_000L;
	private static final int NEAR_RESPAWN_BLOCKS = 48;

	private MushroomLostRecoveryPolicy() {
	}

	/** Returns whether enough owner-contact time has elapsed and respawn safety does not already apply. */
	public static boolean shouldRecover(long currentGameTime, long lastOwnerContactGameTime, boolean nearRespawnPoint) {
		return !nearRespawnPoint && currentGameTime - Math.max(0L, lastOwnerContactGameTime) >= LOST_OWNER_TICKS;
	}

	/** Returns whether Mushroom is close enough to the owner's respawn point to skip forced recovery. */
	public static boolean nearRespawnPoint(BlockPos yorkiePos, BlockPos respawnPos) {
		return yorkiePos.distSqr(respawnPos) <= NEAR_RESPAWN_BLOCKS * NEAR_RESPAWN_BLOCKS;
	}
}
