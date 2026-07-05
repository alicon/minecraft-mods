package dev.alicon.mushroomyorkie.pet;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

final class PetNeedsTest {
	@Test
	void defaultNeedsStartInHealthyRange() {
		PetNeeds needs = new PetNeeds();

		assertEquals(0, needs.hunger());
		assertEquals(0, needs.potty());
		assertEquals(80, needs.mood());
		assertEquals(80, needs.energy());
		assertFalse(needs.shouldWarnPotty());
	}

	@Test
	void constructorClampsLoadedValues() {
		PetNeeds needs = new PetNeeds(-20, 120, 250, -1);

		assertEquals(0, needs.hunger());
		assertEquals(100, needs.potty());
		assertEquals(100, needs.mood());
		assertEquals(0, needs.energy());
	}

	@Test
	void treatFeedsAndImprovesMoodButRaisesPottyNeed() {
		PetNeeds needs = new PetNeeds(70, 15, 60, 40);

		needs.feedTreat();

		assertEquals(35, needs.hunger());
		assertEquals(35, needs.potty());
		assertEquals(78, needs.mood());
		assertEquals(48, needs.energy());
	}

	@Test
	void treatEffectsClampAtBounds() {
		PetNeeds needs = new PetNeeds(20, 90, 95, 98);

		needs.feedTreat();

		assertEquals(0, needs.hunger());
		assertEquals(100, needs.potty());
		assertEquals(100, needs.mood());
		assertEquals(100, needs.energy());
	}

	@Test
	void bowlMealFeedsMoreThanTreatAndRaisesPottyNeed() {
		PetNeeds needs = new PetNeeds(90, 20, 60, 40);

		needs.eatMeal();

		assertEquals(25, needs.hunger());
		assertEquals(45, needs.potty());
		assertEquals(70, needs.mood());
		assertEquals(46, needs.energy());
	}

	@Test
	void normalPlayerFoodFeedsByNutritionValue() {
		PetNeeds needs = new PetNeeds(90, 20, 60, 40);

		needs.eatPlayerFood(4);

		assertEquals(58, needs.hunger());
		assertEquals(28, needs.potty());
		assertEquals(66, needs.mood());
		assertEquals(44, needs.energy());
	}

	@Test
	void waterBowlImprovesMoodButStillAddsPottyNeed() {
		PetNeeds needs = new PetNeeds(50, 20, 60, 40);

		needs.drinkWater();

		assertEquals(50, needs.hunger());
		assertEquals(28, needs.potty());
		assertEquals(64, needs.mood());
		assertEquals(40, needs.energy());
	}

	@Test
	void toyPlayRaisesMoodAndSpendsEnergy() {
		PetNeeds needs = new PetNeeds(50, 20, 60, 40);

		needs.playWithToy();

		assertEquals(50, needs.hunger());
		assertEquals(20, needs.potty());
		assertEquals(74, needs.mood());
		assertEquals(36, needs.energy());
	}

	@Test
	void normalInsideTickIncreasesHungerPottyAndSpendsEnergy() {
		PetNeeds needs = new PetNeeds(20, 10, 80, 50);

		needs.tickNeeds(false, false);

		assertEquals(21, needs.hunger());
		assertEquals(11, needs.potty());
		assertEquals(80, needs.mood());
		assertEquals(49, needs.energy());
	}

	@Test
	void hungryDogBuildsPottyNeedFaster() {
		PetNeeds needs = new PetNeeds(65, 10, 80, 50);

		needs.tickNeeds(false, false);

		assertEquals(66, needs.hunger());
		assertEquals(12, needs.potty());
	}

	@Test
	void sittingPreservesEnergy() {
		PetNeeds needs = new PetNeeds(20, 10, 80, 50);

		needs.tickNeeds(false, true);

		assertEquals(50, needs.energy());
	}

	@Test
	void restingTickCanSkipFoodDrain() {
		PetNeeds needs = new PetNeeds(20, 10, 80, 50);

		needs.tickNeeds(false, true, false);

		assertEquals(20, needs.hunger());
		assertEquals(11, needs.potty());
		assertEquals(50, needs.energy());
	}

	@Test
	void foodBarCountsDownAsHungerRises() {
		PetNeeds needs = new PetNeeds(73, 10, 80, 50);

		assertEquals(3, needs.foodPips());
		assertEquals("[###.......] 3/10", needs.foodBar());
		assertFalse(needs.isStarving());
	}

	@Test
	void emptyFoodBarMeansStarving() {
		PetNeeds needs = new PetNeeds(100, 10, 80, 50);

		assertEquals(0, needs.foodPips());
		assertTrue(needs.isStarving());
	}

	@Test
	void outsideTickDrainsPottyAndImprovesMood() {
		PetNeeds needs = new PetNeeds(20, 30, 70, 50);

		needs.tickNeeds(true, false);

		assertEquals(21, needs.hunger());
		assertEquals(23, needs.potty());
		assertEquals(71, needs.mood());
		assertEquals(49, needs.energy());
	}

	@Test
	void relievingOutsideResetsPottyAndImprovesMood() {
		PetNeeds needs = new PetNeeds(20, 95, 70, 50);

		needs.relieveOutside();

		assertEquals(0, needs.potty());
		assertEquals(74, needs.mood());
	}

	@Test
	void indoorPottyWarningDropsMood() {
		PetNeeds needs = new PetNeeds(20, 81, 70, 50);

		needs.tickNeeds(false, false);

		assertEquals(82, needs.potty());
		assertEquals(68, needs.mood());
		assertTrue(needs.shouldWarnPotty());
	}
}
