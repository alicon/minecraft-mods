package dev.alicon.mushroomyorkie.entity;

final class StructureScentTrailConfidence {
	static final int RECOVER_CLEAR_TICKS = 40;
	static final int LOST_BLOCKED_TICKS = 60;

	private int blockedTicks;
	private int clearTicks;
	private int recoveryTicks;
	private boolean recovering;

	void reset() {
		this.blockedTicks = 0;
		this.clearTicks = 0;
		this.recoveryTicks = 0;
		this.recovering = false;
	}

	void addBlockedTicks(int ticks) {
		this.blockedTicks += ticks;
	}

	StructureScentTrailUpdate tick(boolean blocked, int recoveryDurationTicks) {
		boolean startedRecovery = false;
		boolean recovered = false;
		boolean gaveUp = false;

		if (blocked) {
			this.blockedTicks++;
			this.clearTicks = 0;
		} else {
			this.clearTicks++;
			if (!this.recovering) {
				this.blockedTicks = 0;
			}
		}

		if (!this.recovering && this.blockedTicks >= LOST_BLOCKED_TICKS) {
			this.recovering = true;
			this.recoveryTicks = recoveryDurationTicks;
			startedRecovery = true;
		}

		if (!this.recovering) {
			return this.update(startedRecovery, recovered, gaveUp);
		}

		if (this.clearTicks >= RECOVER_CLEAR_TICKS) {
			this.recovering = false;
			this.blockedTicks = 0;
			recovered = true;
			return this.update(startedRecovery, recovered, gaveUp);
		}

		this.recoveryTicks--;
		if (this.recoveryTicks <= 0) {
			gaveUp = true;
		}
		return this.update(startedRecovery, recovered, gaveUp);
	}

	int blockedTicks() {
		return this.blockedTicks;
	}

	int recoveryTicks() {
		return this.recoveryTicks;
	}

	private StructureScentTrailUpdate update(boolean startedRecovery, boolean recovered, boolean gaveUp) {
		return new StructureScentTrailUpdate(this.recovering, startedRecovery, recovered, gaveUp);
	}
}

record StructureScentTrailUpdate(boolean recovering, boolean startedRecovery, boolean recovered, boolean gaveUp) {
}
