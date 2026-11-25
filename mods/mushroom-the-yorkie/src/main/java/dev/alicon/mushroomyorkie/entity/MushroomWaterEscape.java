package dev.alicon.mushroomyorkie.entity;

import net.minecraft.world.phys.Vec3;

/** Frees a stalled submerged swimmer; surface swimming, owner flight and fetch flight retain control. */
final class MushroomWaterEscape {
	private static final double CLEAR_RISE_BLOCKS = 1.0D;
	private static final double SEARCH_RADIUS_BLOCKS = 3.0D;
	private static final double SEARCH_STEP_BLOCKS = 0.25D;
	private static final double SWIM_SPEED_BLOCKS_PER_TICK = 0.12D;
	private static final double ASCENT_SPEED_BLOCKS_PER_TICK = 0.08D;
	private static final int REPLAN_TICKS = 10;
	private static final int STALLED_TICKS = 20;
	private static final double PROGRESS_DISTANCE_SQ = 0.2D * 0.2D;
	// Native contact can overlap by floating-point epsilon at a bank/boat edge.
	// This is planning tolerance only; actual movement keeps full native collision.
	private static final double CONTACT_TOLERANCE_BLOCKS = 0.0001D;
	private final MushroomYorkieEntity yorkie;
	private final WaterEscapeAttempts attempts = new WaterEscapeAttempts();
	private Vec3 approach;
	private int nextPlanTick;
	private boolean escaping;
	private Vec3 progressAnchor;
	private int stalledTicks;

	MushroomWaterEscape(MushroomYorkieEntity yorkie) {
		this.yorkie = yorkie;
	}

	void tick() {
		if (!this.yorkie.isInWater() || !this.yorkie.isUnderWater() || this.yorkie.isPassenger()
				|| MushroomYorkieStateQueries.ownerIsCreativeFlying(this.yorkie) || this.yorkie.fetchFlight.flying()) {
			this.approach = null;
			this.escaping = false;
			this.progressAnchor = null;
			this.attempts.clearRoute();
			this.stalledTicks = 0;
			return;
		}
		if (this.attempts.coolingDown(this.yorkie.tickCount)) {
			return;
		}
		if (this.progressAnchor == null || this.yorkie.position().distanceToSqr(this.progressAnchor) >= PROGRESS_DISTANCE_SQ) {
			this.progressAnchor = this.yorkie.position();
			this.stalledTicks = 0;
		} else {
			this.stalledTicks++;
		}
		boolean clearAbove = this.clearAbove();
		if (!this.escaping && (clearAbove || this.stalledTicks < STALLED_TICKS)) {
			this.attempts.clearRoute();
			return;
		}
		if (this.escaping && !this.attempts.continueEpisode(this.yorkie.tickCount)) {
			this.escaping = false;
			this.approach = null;
			this.stalledTicks = 0;
			return;
		}
		if (this.escaping && this.stalledTicks >= STALLED_TICKS) {
			Vec3 failed = this.approach == null ? this.yorkie.position() : this.approach;
			this.attempts.fail(failed.x, failed.z, this.yorkie.tickCount);
			this.approach = null;
			this.stalledTicks = 0;
			if (this.attempts.coolingDown(this.yorkie.tickCount)) {
				this.escaping = false;
				return;
			}
			clearAbove = this.clearAbove();
		}
		if (!this.prepareRoute(clearAbove)) {
			return;
		}
		if (!this.escaping) {
			if (!this.attempts.continueEpisode(this.yorkie.tickCount)) {
				return;
			}
			this.progressAnchor = this.yorkie.position();
			this.stalledTicks = 0;
			this.escaping = true;
		}
		Vec3 velocity = this.yorkie.getDeltaMovement();
		MushroomMovement.stop(this.yorkie);
		if (clearAbove) {
			this.approach = null;
			// Stay in the clear column until surfacing; immediately following the
			// owner again would send the swimmer back beneath the same obstruction.
			this.yorkie.setDeltaMovement(0, Math.max(velocity.y, ASCENT_SPEED_BLOCKS_PER_TICK), 0);
		} else {
			Vec3 direction = this.approach.subtract(this.yorkie.position()).multiply(1, 0, 1).normalize();
			this.yorkie.setDeltaMovement(direction.x * SWIM_SPEED_BLOCKS_PER_TICK, velocity.y,
					direction.z * SWIM_SPEED_BLOCKS_PER_TICK);
		}
	}

	private boolean prepareRoute(boolean clearAbove) {
		if (this.approach != null) {
			this.approach = new Vec3(this.approach.x, this.yorkie.getY(), this.approach.z);
		}
		if (clearAbove) {
			return true;
		}
		if (this.approach != null && this.canReach(this.approach)) {
			return true;
		}

		this.approach = null;
		if (this.yorkie.tickCount >= this.nextPlanTick) {
			this.nextPlanTick = this.yorkie.tickCount + REPLAN_TICKS;
			this.approach = this.findApproach();
		}
		return this.approach != null;
	}

	private Vec3 findApproach() {
		for (double radius = SEARCH_STEP_BLOCKS; radius <= SEARCH_RADIUS_BLOCKS; radius += SEARCH_STEP_BLOCKS) {
			for (int direction = 0; direction < 8; direction++) {
				double angle = direction * Math.PI / 4;
				Vec3 candidate = this.yorkie.position().add(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
				if (this.attempts.allows(candidate.x, candidate.z) && this.canReach(candidate)) {
					return candidate;
				}
			}
		}
		return null;
	}

	private boolean canReach(Vec3 point) {
		Vec3 delta = point.subtract(this.yorkie.position());
		var box = this.yorkie.getBoundingBox();
		return this.yorkie.level().noCollision(this.yorkie, box.deflate(CONTACT_TOLERANCE_BLOCKS).expandTowards(delta))
				&& this.yorkie.level().noCollision(this.yorkie, box.move(delta).expandTowards(0, CLEAR_RISE_BLOCKS, 0));
	}

	private boolean clearAbove() {
		return this.attempts.allows(this.yorkie.getX(), this.yorkie.getZ())
				&& MushroomClearAscent.canReach(this.yorkie, this.yorkie.position(), CLEAR_RISE_BLOCKS);
	}

	boolean active() {
		return this.escaping;
	}

	@Override
	public String toString() {
		return "escaping=" + this.escaping + ", approach=" + this.approach + ", velocity=" + this.yorkie.getDeltaMovement()
				+ ", bodyClear=" + this.yorkie.level().noCollision(this.yorkie, this.yorkie.getBoundingBox())
				+ ", ownerCreative=" + MushroomYorkieStateQueries.ownerIsCreative(this.yorkie);
	}
}
