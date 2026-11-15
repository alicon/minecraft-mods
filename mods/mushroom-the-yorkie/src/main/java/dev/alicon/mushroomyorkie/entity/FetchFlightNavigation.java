package dev.alicon.mushroomyorkie.entity;

import net.minecraft.core.BlockPos;
import net.minecraft.world.entity.ai.navigation.FlyingPathNavigation;
import net.minecraft.world.level.pathfinder.Path;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.phys.AABB;

/** Server-only fetch steering. Native flying paths route around floors instead of aiming through them. */
final class FetchFlightNavigation {
	private static final int REPLAN_TICKS = 20;
	private static final int CLEAR_ASCENT_SEARCH_RADIUS_BLOCKS = 8;
	private static final double ASCENT_TOLERANCE_BLOCKS = 0.1D;
	private static final double ASCENT_START_HEIGHT_BLOCKS = 1.0D;
	private static final double TARGET_REFRESH_DISTANCE_SQ = 1.0D;
	private static final double WAYPOINT_REACHED_DISTANCE_SQ = 0.04D;
	private final MushroomYorkieEntity yorkie;
	private FlyingPathNavigation navigation;
	private Vec3 target;
	private Vec3 plannedTarget;
	private Vec3 ascentApproach;
	private int nextAscentSearchTick;
	private Path path;
	private int nextPlanTick;
	private boolean blocked;
	private boolean ascending;
	private boolean flightRequested;

	FetchFlightNavigation(MushroomYorkieEntity yorkie) {
		this.yorkie = yorkie;
	}

	void request(Vec3 target) {
		this.target = target;
		this.flightRequested |= MushroomYorkieStateQueries.ownerIsCreativeFlying(this.yorkie);
	}

	void clear() {
		this.target = null;
		this.flightRequested = false;
		this.replan();
	}

	void replan() {
		this.plannedTarget = null;
		this.path = null;
		this.blocked = false;
		this.ascending = false;
		this.ascentApproach = null;
		this.nextAscentSearchTick = 0;
	}

	boolean active() {
		return this.target != null;
	}

	// Landing does not revoke an already-started creative fetch route. Lifecycle resets do.
	boolean flying() {
		return this.active() && this.flightRequested && MushroomYorkieStateQueries.ownerIsCreative(this.yorkie);
	}

	boolean blocked() {
		return this.active() && this.blocked;
	}

	Vec3 steeringTarget() {
		Vec3 ascent = this.clearAscentTarget();
		if (ascent != null) {
			this.path = null;
			this.plannedTarget = null;
			this.blocked = false;
			return ascent;
		}
		if (this.navigation == null) {
			this.navigation = new FlyingPathNavigation(this.yorkie, this.yorkie.level());
			this.navigation.setCanFloat(true);
		}
		boolean shifted = this.plannedTarget == null || this.plannedTarget.distanceToSqr(this.target) > TARGET_REFRESH_DISTANCE_SQ;
		if (shifted || this.yorkie.tickCount >= this.nextPlanTick || this.path != null && this.path.isDone() && !this.blocked) {
			this.path = this.navigation.createPath(BlockPos.containing(this.target), 0);
			this.blocked = this.path == null || !this.path.canReach();
			this.plannedTarget = this.target;
			this.nextPlanTick = this.yorkie.tickCount + REPLAN_TICKS;
		}
		if (this.path == null) {
			return this.yorkie.position();
		}
		while (!this.path.isDone() && this.yorkie.position().distanceToSqr(this.path.getNextEntityPos(this.yorkie)) <= WAYPOINT_REACHED_DISTANCE_SQ) {
			this.path.advance();
		}
		return this.path.isDone() ? this.blocked ? this.yorkie.position() : this.target : this.path.getNextEntityPos(this.yorkie);
	}

	private Vec3 clearAscentTarget() {
		double rise = this.target.y - this.yorkie.getY();
		// Hysteresis lets the pathfinder use integer-height waypoints after the lift.
		// Without it, a fractional owner height repeatedly pulls the pet up and back down.
		if (rise <= ASCENT_TOLERANCE_BLOCKS || !this.ascending && rise <= ASCENT_START_HEIGHT_BLOCKS) {
			this.ascending = false;
			this.ascentApproach = null;
			return null;
		}
		this.ascending = true;
		AABB box = this.yorkie.getBoundingBox();
		if (this.yorkie.level().noCollision(this.yorkie, box.expandTowards(0, rise, 0))) {
			this.ascentApproach = null;
			return new Vec3(this.yorkie.getX(), this.target.y, this.yorkie.getZ());
		}
		if (this.ascentApproach != null && this.clearAscentApproach(this.ascentApproach, rise)) {
			return this.ascentApproach;
		}
		this.ascentApproach = null;
		if (this.yorkie.tickCount < this.nextAscentSearchTick) {
			return null;
		}
		this.nextAscentSearchTick = this.yorkie.tickCount + REPLAN_TICKS;
		double nearest = Double.MAX_VALUE;
		BlockPos origin = this.yorkie.blockPosition();
		for (int dx = -CLEAR_ASCENT_SEARCH_RADIUS_BLOCKS; dx <= CLEAR_ASCENT_SEARCH_RADIUS_BLOCKS; dx++) {
			for (int dz = -CLEAR_ASCENT_SEARCH_RADIUS_BLOCKS; dz <= CLEAR_ASCENT_SEARCH_RADIUS_BLOCKS; dz++) {
				Vec3 candidate = new Vec3(origin.getX() + dx + 0.5D, this.yorkie.getY(), origin.getZ() + dz + 0.5D);
				double distance = candidate.distanceToSqr(this.yorkie.position());
				if (distance < nearest && this.clearAscentApproach(candidate, rise)) {
					nearest = distance;
					this.ascentApproach = candidate;
				}
			}
		}
		return this.ascentApproach;
	}

	private boolean clearAscentApproach(Vec3 candidate, double rise) {
		Vec3 delta = candidate.subtract(this.yorkie.position());
		AABB box = this.yorkie.getBoundingBox();
		// The swept boxes are conservative: both the approach and full vertical column must be empty.
		return this.yorkie.level().noCollision(this.yorkie, box.expandTowards(delta))
				&& this.yorkie.level().noCollision(this.yorkie, box.move(delta).expandTowards(0, rise, 0));
	}

	@Override
	public String toString() {
		return "target=" + this.target + ", targetBlock=" + (this.target == null ? "none" : this.yorkie.level().getBlockState(BlockPos.containing(this.target))) + ", blocked=" + this.blocked + ", path=" + this.path
				+ (this.path == null ? "" : ", node=" + this.path.getNextNodeIndex() + "/" + this.path.getNodeCount()
						+ (this.path.isDone() ? "" : ", next=" + this.path.getNextEntityPos(this.yorkie)));
	}
}
