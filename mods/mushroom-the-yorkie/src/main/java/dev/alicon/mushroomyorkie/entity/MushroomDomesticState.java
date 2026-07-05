package dev.alicon.mushroomyorkie.entity;

final class MushroomDomesticState {
	private long lastFoodBowlDay = DomesticCarePolicy.unloadedDay();
	private long lastWaterBowlDay = DomesticCarePolicy.unloadedDay();

	boolean canEatFoodBowl(long currentDay, int hunger) {
		return DomesticCarePolicy.canEatFoodBowl(currentDay, this.lastFoodBowlDay, hunger);
	}

	boolean canDrinkWaterBowl(long currentDay) {
		return DomesticCarePolicy.canDrinkWaterBowl(currentDay, this.lastWaterBowlDay);
	}

	boolean ateFoodToday(long currentDay) {
		return this.lastFoodBowlDay == currentDay;
	}

	void recordFoodBowl(long currentDay) {
		this.lastFoodBowlDay = currentDay;
	}

	void recordWaterBowl(long currentDay) {
		this.lastWaterBowlDay = currentDay;
	}

	long lastFoodBowlDay() {
		return this.lastFoodBowlDay;
	}

	long lastWaterBowlDay() {
		return this.lastWaterBowlDay;
	}

	void setLastFoodBowlDay(long day) {
		this.lastFoodBowlDay = day;
	}

	void setLastWaterBowlDay(long day) {
		this.lastWaterBowlDay = day;
	}
}
