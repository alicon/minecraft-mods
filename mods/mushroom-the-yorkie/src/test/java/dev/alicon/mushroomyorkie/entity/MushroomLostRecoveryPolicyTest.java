package dev.alicon.mushroomyorkie.entity;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import net.minecraft.core.BlockPos;
import org.junit.jupiter.api.Test;

final class MushroomLostRecoveryPolicyTest {
	@Test
	void recoversAfterFullMinecraftDayAwayFromOwner() {
		assertTrue(MushroomLostRecoveryPolicy.shouldRecover(48_000L, 24_000L, false));
	}

	@Test
	void doesNotRecoverBeforeFullMinecraftDayAwayFromOwner() {
		assertFalse(MushroomLostRecoveryPolicy.shouldRecover(47_999L, 24_000L, false));
	}

	@Test
	void doesNotRecoverWhenAlreadyNearRespawnPoint() {
		assertFalse(MushroomLostRecoveryPolicy.shouldRecover(48_000L, 24_000L, true));
	}

	@Test
	void nearRespawnPointUsesFortyEightBlockRadius() {
		assertTrue(MushroomLostRecoveryPolicy.nearRespawnPoint(new BlockPos(40, 64, 0), new BlockPos(0, 64, 0)));
		assertFalse(MushroomLostRecoveryPolicy.nearRespawnPoint(new BlockPos(60, 64, 0), new BlockPos(0, 64, 0)));
	}
}
