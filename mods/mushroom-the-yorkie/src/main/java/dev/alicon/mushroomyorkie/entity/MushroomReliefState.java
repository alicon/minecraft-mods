package dev.alicon.mushroomyorkie.entity;

final class MushroomReliefState {
	private static final long NEVER_RELIEVED = -1L;
	private long lastReliefDay = NEVER_RELIEVED;
	private int outdoorReliefTicks;
	private boolean tripActive;

	boolean shouldAskToday(long day, boolean needsOutside) {
		return (needsOutside || this.tripActive || this.outdoorReliefTicks > 0) && this.lastReliefDay != day;
	}

	// Urgency starts a trip; ordinary need decay must not cancel it before the action completes.
	void beginTrip() {
		this.tripActive = true;
	}

	void endTrip() {
		this.tripActive = false;
		this.resetOutdoorRelief();
	}

	boolean tickOutdoorRelief() {
		return ++this.outdoorReliefTicks >= MushroomReliefHandler.RELIEF_TICKS;
	}

	void resetOutdoorRelief() {
		this.outdoorReliefTicks = 0;
	}

	void recordRelief(long day) {
		this.lastReliefDay = day;
		this.endTrip();
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
