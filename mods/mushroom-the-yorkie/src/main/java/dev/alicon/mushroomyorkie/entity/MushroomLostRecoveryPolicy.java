package dev.alicon.mushroomyorkie.entity;

import net.minecraft.core.BlockPos;

/** Pure policy for deciding when a lost Mushroom should return to the owner instead of staying stranded. */
public final class MushroomLostRecoveryPolicy {
	static final long LOST_OWNER_TICKS = 24_000L;
	private static final int NEAR_RESPAWN_BLOCKS = 48;

	private MushroomLostRecoveryPolicy() {
	}

	/** Returns true once Mushroom has been away from the owner for a full Minecraft day and is not already near the respawn point. */
	public static boolean shouldRecover(long currentGameTime, long lastOwnerContactGameTime, boolean nearRespawnPoint) {
		return !nearRespawnPoint && currentGameTime - Math.max(0L, lastOwnerContactGameTime) >= LOST_OWNER_TICKS;
	}

	/** Returns whether Mushroom is close enough to the owner's respawn point to avoid forced recovery. */
	public static boolean nearRespawnPoint(BlockPos yorkiePos, BlockPos respawnPos) {
		return yorkiePos.distSqr(respawnPos) <= NEAR_RESPAWN_BLOCKS * NEAR_RESPAWN_BLOCKS;
	}
}
