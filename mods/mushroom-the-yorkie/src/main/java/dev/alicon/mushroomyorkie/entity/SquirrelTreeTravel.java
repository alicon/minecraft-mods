package dev.alicon.mushroomyorkie.entity;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import net.minecraft.core.BlockPos;
import net.minecraft.tags.BlockTags;
import net.minecraft.world.phys.Vec3;

final class SquirrelTreeTravel {
	// Distances are blocks per native entity tick. The leap is sampled along a checked arc.
	private static final double SURFACE_SPEED = 0.19D;
	private static final double LEAP_SPEED = 0.62D;
	private static final int CROWN_REST_TICKS = 20 * 3;
	private static final int CROWN_RECHECK_TICKS = 20 * 6;
	private static final int TRANSIT_TIMEOUT_TICKS = 20 * 12;
	private static final double REACHED_SQR = 0.035D * 0.035D;

	private final SquirrelEntity squirrel;
	private final Deque<Vec3> waypoints = new ArrayDeque<>();
	private BlockPos tree;
	private BlockPos nextTree;
	private BlockPos landing;
	private BlockPos vacatedTree;
	private Phase phase;
	private int nextAction;
	private int routeTicks;

	SquirrelTreeTravel(SquirrelEntity squirrel) {
		this.squirrel = squirrel;
	}

	boolean start(BlockPos trunk) {
		this.tree = trunk;
		List<Vec3> route = SquirrelCanopyPaths.climb(this.squirrel, trunk);
		if (route.isEmpty()) return false;
		this.squirrel.getNavigation().stop();
		this.squirrel.setTreeClimbing(false);
		this.follow(route, Phase.CLIMB);
		return true;
	}

	boolean active() {
		return this.phase != null && this.phase != Phase.FINISHED;
	}

	boolean finished() {
		return this.phase == Phase.FINISHED;
	}

	BlockPos vacatedTree() {
		return this.vacatedTree;
	}

	void reset() {
		this.phase = null;
		this.tree = null;
		this.nextTree = null;
		this.landing = null;
		this.vacatedTree = null;
		this.waypoints.clear();
	}

	void tick() {
		if (this.phase == Phase.REST) {
			this.restOnCrown();
			return;
		}
		if (++this.routeTicks > TRANSIT_TIMEOUT_TICKS) {
			this.finish(false);
			return;
		}
		Vec3 feet = this.squirrel.position();
		while (!this.waypoints.isEmpty() && feet.distanceToSqr(this.waypoints.peek()) <= REACHED_SQR) this.waypoints.removeFirst();
		if (this.waypoints.isEmpty()) {
			this.routeEnded();
			return;
		}
		Vec3 next = this.waypoints.peek();
		boolean onSurface = this.phase == Phase.CLIMB || this.phase == Phase.DESCEND;
		BlockPos nextCell = BlockPos.containing(next);
		if (onSurface && !SquirrelCanopyPaths.touchesTree(this.squirrel.level(), nextCell)
				&& !(this.phase == Phase.DESCEND && this.waypoints.size() == 1
				&& SquirrelFindTreeGoal.isStandable(this.squirrel.level(), nextCell))) {
			this.finish(false);
			return;
		}
		Vec3 delta = next.subtract(feet);
		double limit = this.phase == Phase.LEAP ? LEAP_SPEED : SURFACE_SPEED;
		if (delta.lengthSqr() > limit * limit) delta = delta.normalize().scale(limit);
		if (!SquirrelCanopyPaths.stepIsClear(this.squirrel, feet, feet.add(delta))) {
			this.finish(false);
			return;
		}
		this.squirrel.resetFallDistance();
		this.squirrel.getLookControl().setLookAt(this.waypoints.peek());
		if (onSurface && delta.horizontalDistance() > Math.abs(delta.y)
				&& this.squirrel.level().getBlockState(this.squirrel.blockPosition().above()).is(BlockTags.LEAVES)) {
			this.squirrel.poseUnderLeaves(delta.x, delta.z);
		} else if (onSurface && Math.abs(delta.y) > delta.horizontalDistance()) {
			this.squirrel.poseAgainstTrunk(this.tree, this.phase == Phase.DESCEND);
		} else {
			this.squirrel.clearTreePose();
		}
		this.squirrel.setDeltaMovement(delta);
	}

	private void routeEnded() {
		if (this.phase == Phase.DESCEND) {
			this.finish(true);
		} else if (this.phase == Phase.WALK_TO_LEAP) {
			List<Vec3> arc = SquirrelCanopyPaths.arc(this.squirrel, this.squirrel.position(), this.landing);
			if (arc.isEmpty()) this.beginRest();
			else this.follow(arc, Phase.LEAP);
		} else {
			if (this.phase == Phase.LEAP) this.tree = this.nextTree;
			this.beginRest();
		}
	}

	private void beginRest() {
		this.phase = Phase.REST;
		this.squirrel.clearTreePose();
		this.nextAction = CROWN_REST_TICKS;
		this.squirrel.setNoGravity(false);
		this.squirrel.setDeltaMovement(Vec3.ZERO);
	}

	private void restOnCrown() {
		if (!SquirrelCanopyPaths.crown(this.squirrel, this.squirrel.blockPosition())) {
			this.finish(false);
			return;
		}
		if (--this.nextAction > 0) return;
		this.nextAction = CROWN_RECHECK_TICKS;
		this.nextTree = SquirrelCanopyPaths.nextTree(this.squirrel, this.tree);
		if (this.nextTree == null) return;
		var leap = SquirrelCanopyPaths.leapTo(this.squirrel, this.tree, this.nextTree);
		if (leap != null) {
			this.landing = leap.landing();
			this.follow(leap.approach(), Phase.WALK_TO_LEAP);
			return;
		}
		List<Vec3> descent = SquirrelCanopyPaths.descend(this.squirrel, this.tree);
		if (!descent.isEmpty()) this.follow(descent, Phase.DESCEND);
	}

	private void follow(List<Vec3> route, Phase movement) {
		this.phase = movement;
		this.routeTicks = 0;
		this.waypoints.clear();
		this.waypoints.addAll(route);
		this.squirrel.setNoGravity(true);
	}

	private void finish(boolean descended) {
		this.vacatedTree = descended ? this.tree : null;
		this.phase = Phase.FINISHED;
		this.squirrel.clearTreePose();
		this.squirrel.setFoundTree(false);
		this.squirrel.setNoGravity(false);
		if (descended) this.squirrel.setDeltaMovement(Vec3.ZERO);
	}

	private enum Phase {
		CLIMB, REST, WALK_TO_LEAP, LEAP, DESCEND, FINISHED
	}
}
