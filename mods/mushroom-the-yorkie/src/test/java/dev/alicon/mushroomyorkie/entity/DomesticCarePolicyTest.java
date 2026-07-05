package dev.alicon.mushroomyorkie.entity;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

final class DomesticCarePolicyTest {
	@Test
	void foodBowlCanOnlyBeEatenOncePerMinecraftDayWhenHungry() {
		assertTrue(DomesticCarePolicy.canEatFoodBowl(4L, 3L, 80));
		assertFalse(DomesticCarePolicy.canEatFoodBowl(4L, 4L, 80));
		assertFalse(DomesticCarePolicy.canEatFoodBowl(4L, 3L, 20));
	}

	@Test
	void waterBowlCanOnlyBeUsedOncePerMinecraftDay() {
		assertTrue(DomesticCarePolicy.canDrinkWaterBowl(4L, 3L));
		assertFalse(DomesticCarePolicy.canDrinkWaterBowl(4L, 4L));
	}

	@Test
	void hungerPromptOnlyHappensAfterBowlsExistAndFoodIsMissing() {
		assertTrue(DomesticCarePolicy.shouldAskForFood(90, true, false, false));
		assertFalse(DomesticCarePolicy.shouldAskForFood(90, false, false, false));
		assertFalse(DomesticCarePolicy.shouldAskForFood(90, true, true, false));
		assertFalse(DomesticCarePolicy.shouldAskForFood(90, true, false, true));
		assertFalse(DomesticCarePolicy.shouldAskForFood(50, true, false, false));
	}
}
