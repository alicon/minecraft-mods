package dev.alicon.mushroomyorkie.entity;

import java.util.ArrayList;
import java.util.List;

/** Bounds one escape episode and remembers failed horizontal columns despite vertical bobbing. */
final class WaterEscapeAttempts {
	private static final int MAX_FAILURES = 4;
	private static final int RETRY_COOLDOWN_TICKS = 40;
	private static final int EPISODE_TICKS = 80;
	private static final double COLUMN_DISTANCE_SQ = 0.2D * 0.2D;
	private final List<Column> failed = new ArrayList<>();
	private int retryAfterTick;
	private int startedTick = -1;

	boolean continueEpisode(int tick) {
		if (this.coolingDown(tick)) return false;
		if (this.startedTick < 0) this.startedTick = tick;
		if (tick - this.startedTick < EPISODE_TICKS) return true;
		this.release(tick);
		return false;
	}

	void fail(double x, double z, int tick) {
		this.failed.add(new Column(x, z));
		if (this.failed.size() >= MAX_FAILURES) {
			this.release(tick);
		}
	}

	boolean coolingDown(int tick) {
		return tick < this.retryAfterTick;
	}

	boolean allows(double x, double z) {
		return this.failed.stream().noneMatch(point -> {
			double dx = point.x - x;
			double dz = point.z - z;
			return dx * dx + dz * dz < COLUMN_DISTANCE_SQ;
		});
	}

	void clearRoute() {
		this.failed.clear();
		this.startedTick = -1;
	}

	private void release(int tick) {
		this.clearRoute();
		this.retryAfterTick = tick + RETRY_COOLDOWN_TICKS;
	}

	private record Column(double x, double z) {
	}
}
