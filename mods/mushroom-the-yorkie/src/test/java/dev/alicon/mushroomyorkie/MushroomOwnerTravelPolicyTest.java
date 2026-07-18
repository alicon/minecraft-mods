package dev.alicon.mushroomyorkie;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

final class MushroomOwnerTravelPolicyTest {
	@Test
	void livingFollowingYorkieTravelsWithItsPlayer() {
		assertTrue(MushroomOwnerTravelPolicy.shouldFollow(true, true, false));
	}

	@Test
	void sittingUnownedOrDeadYorkieStaysBehind() {
		assertFalse(MushroomOwnerTravelPolicy.shouldFollow(true, true, true));
		assertFalse(MushroomOwnerTravelPolicy.shouldFollow(true, false, false));
		assertFalse(MushroomOwnerTravelPolicy.shouldFollow(false, true, false));
	}
}
