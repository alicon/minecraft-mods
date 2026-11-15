package dev.alicon.mushroomyorkie.entity;

import net.minecraft.world.phys.Vec3;

final class MushroomCreativeFlightRecovery {
	private static final int HINT_TICKS = 4;
	private static final int REQUEST_TICKS = 20 * 4;

	private int blockTicks;
	private int requestTicks;
	private MushroomFlightRoute route;

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

	Vec3 steeringTarget(MushroomYorkieEntity yorkie, Vec3 target) {
		if (this.route == null) {
			this.route = new MushroomFlightRoute(yorkie);
		}
		this.route.request(target);
		return this.route.steeringTarget();
	}

	void clearRoute() {
		if (this.route != null) {
			this.route.clear();
		}
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
