package dev.alicon.mushroomyorkie.entity;

final class MushroomCreativeFlightRecovery {
	private static final int HINT_TICKS = 4;
	private static final int REQUEST_TICKS = 20 * 4;

	private int blockTicks;
	private int requestTicks;

	void block() {
		this.blockTicks = HINT_TICKS;
	}

	boolean blocks() {
		return this.blockTicks > 0;
	}

	void request() {
		this.blockTicks = 0;
		this.requestTicks = REQUEST_TICKS;
	}

	boolean hasRequest() {
		return this.requestTicks > 0;
	}

	void tick() {
		if (this.blockTicks > 0) {
			this.blockTicks--;
		}
		if (this.requestTicks > 0) {
			this.requestTicks--;
		}
	}
}
