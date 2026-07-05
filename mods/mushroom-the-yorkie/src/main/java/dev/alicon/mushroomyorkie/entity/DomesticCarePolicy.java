package dev.alicon.mushroomyorkie.entity;

final class DomesticCarePolicy {
	static final int FOOD_HUNGER_THRESHOLD = 45;
	static final int FOOD_ASK_THRESHOLD = 80;
	private static final long NEVER_USED = -1L;

	private DomesticCarePolicy() {
	}

	static boolean canEatFoodBowl(long currentDay, long lastFoodBowlDay, int hunger) {
		return hunger >= FOOD_HUNGER_THRESHOLD && lastFoodBowlDay != currentDay;
	}

	static boolean canDrinkWaterBowl(long currentDay, long lastWaterBowlDay) {
		return lastWaterBowlDay != currentDay;
	}

	static boolean shouldAskForFood(int hunger, boolean hasAnyBowl, boolean hasFoodBowl, boolean alreadyAteToday) {
		return hunger >= FOOD_ASK_THRESHOLD && hasAnyBowl && !hasFoodBowl && !alreadyAteToday;
	}

	static long unloadedDay() {
		return NEVER_USED;
	}
}
