package dev.alicon.mushroomyorkie.entity;

import java.util.function.IntSupplier;

final class CreativeBuildActivity {
	private static final int BUILD_WINDOW_TICKS = 20 * 10;
	private static final int BUILD_ACTIONS_TO_FOCUS = 3;
	private static final int BUILD_FOCUS_TICKS = 20 * 90;
	private static final int NAP_AFTER_QUIET_TICKS = 20 * 35;
	private static final int CHECK_IN_AFTER_QUIET_TICKS = 20 * 9;
	private static final int CHECK_IN_COOLDOWN_TICKS = 20 * 240;
	private long windowStartGameTime;
	private int buildActionsInWindow;
	private long lastBuildAction;
	private long focusUntilGameTime;
	private long nextCheckInGameTime;

	CreativeBuildActivity(long now) {
		this.windowStartGameTime = now;
		this.lastBuildAction = now;
	}

	void record(long now) {
		if (now - this.windowStartGameTime > BUILD_WINDOW_TICKS) {
			this.windowStartGameTime = now;
			this.buildActionsInWindow = 0;
		}
		this.buildActionsInWindow++;
		this.lastBuildAction = now;
		if (this.buildActionsInWindow >= BUILD_ACTIONS_TO_FOCUS || now < this.focusUntilGameTime) {
			this.focusUntilGameTime = now + BUILD_FOCUS_TICKS;
		}
	}

	boolean isFocused(long now) {
		return now < this.focusUntilGameTime;
	}

	boolean isStale(long now) {
		return now - this.lastBuildAction > BUILD_FOCUS_TICKS * 2L;
	}

	boolean shouldNap(long now) {
		return now - this.lastBuildAction >= NAP_AFTER_QUIET_TICKS;
	}

	boolean actionJustHappened(long now) {
		return now - this.lastBuildAction <= 20;
	}

	boolean shouldStartCheckIn(long now, IntSupplier random) {
		if (now - this.lastBuildAction < CHECK_IN_AFTER_QUIET_TICKS) {
			return false;
		}
		if (now < this.nextCheckInGameTime || random.getAsInt() != 0) {
			return false;
		}

		this.nextCheckInGameTime = now + CHECK_IN_COOLDOWN_TICKS;
		return true;
	}
}
