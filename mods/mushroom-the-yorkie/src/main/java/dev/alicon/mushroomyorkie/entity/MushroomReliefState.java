package dev.alicon.mushroomyorkie.entity;

final class MushroomReliefState {
	private static final long NEVER_RELIEVED = -1L;
	private long lastReliefDay = NEVER_RELIEVED;
	private int outdoorReliefTicks;

	boolean shouldAskToday(long day, boolean needsOutside) {
		return needsOutside && this.lastReliefDay != day;
	}

	boolean tickOutdoorRelief() {
		return ++this.outdoorReliefTicks >= MushroomReliefHandler.RELIEF_TICKS;
	}

	void resetOutdoorRelief() {
		this.outdoorReliefTicks = 0;
	}

	void recordRelief(long day) {
		this.lastReliefDay = day;
		this.outdoorReliefTicks = 0;
	}

	long lastReliefDay() {
		return this.lastReliefDay;
	}

	void setLastReliefDay(long lastReliefDay) {
		this.lastReliefDay = lastReliefDay;
	}

	static long neverRelievedDay() {
		return NEVER_RELIEVED;
	}
}
