package dev.alicon.mushroomyorkie.entity;

import java.util.EnumSet;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.tags.BlockTags;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;

final class SquirrelFindTreeGoal extends Goal {
	private static final int SEARCH_RADIUS = 20;
	private static final int SEARCH_Y_RADIUS = 5;
	private static final int MIN_CLIMB_BLOCKS = 2;
	private static final int MAX_CLIMB_BLOCKS = 4;
	// Reach the selected face before climbing; a loose corner radius can hit a blocked neighbor face.
	private static final double REACHED_APPROACH_DISTANCE_SQR = 0.09D;
	// Wall contact needs slower horizontal steering than the run to the tree.
	private static final double CLIMB_SPEED = 0.45D;
	// A nearby tree gets at most ten seconds of approach, even if terrain changes.
	private static final int MAX_APPROACH_TICKS = 200;
	private static final Direction[] APPROACH_DIRECTIONS = {
		Direction.NORTH, Direction.SOUTH, Direction.WEST, Direction.EAST
	};

	private final SquirrelEntity squirrel;
	private BlockPos treePos;
	private BlockPos approachPos;
	private BlockPos climbPos;
	private boolean climbing;
	private int nextSearchTick;
	private int nextMoveTick;
	private int approachTicks;
	private boolean approachFailed;

	SquirrelFindTreeGoal(SquirrelEntity squirrel) {
		this.squirrel = squirrel;
		this.setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK));
	}

	@Override
	public boolean canUse() {
		// Native ground pathfinding cannot assess a newly spawned airborne mob.
		// Wait for its real landing without consuming the search cooldown.
		if (!this.squirrel.onGround()) {
			return false;
		}
		if (this.nextSearchTick-- > 0) {
			return false;
		}

		this.nextSearchTick = 40;
		this.findNearestTree();
		return this.treePos != null;
	}

	@Override
	public boolean canContinueToUse() {
		return this.treePos != null
				&& !this.approachFailed
				&& (this.climbing || this.approachTicks < MAX_APPROACH_TICKS)
				&& this.approachPos != null
				&& this.climbPos != null
				&& this.squirrel.level().getBlockState(this.treePos).is(BlockTags.LOGS)
				&& this.squirrel.level().getBlockState(this.climbPos).is(BlockTags.LOGS)
				&& isStandable(this.squirrel.level(), this.approachPos);
	}

	@Override
	public boolean requiresUpdateEveryTick() {
		return true;
	}

	@Override
	public void start() {
		this.climbing = false;
		this.squirrel.setFoundTree(false);
		this.squirrel.setTreeClimbing(false);
		this.squirrel.setNoGravity(false);
		this.nextMoveTick = 0;
		this.approachTicks = 0;
		this.approachFailed = false;
	}

	@Override
	public void stop() {
		this.treePos = null;
		this.approachPos = null;
		this.climbPos = null;
		this.climbing = false;
		this.squirrel.setFoundTree(false);
		this.squirrel.setTreeClimbing(false);
		this.squirrel.setNoGravity(false);
		this.squirrel.getNavigation().stop();
	}

	@Override
	public void tick() {
		this.squirrel.getLookControl().setLookAt(
				this.climbPos.getX() + 0.5D,
				this.climbPos.getY() + 0.5D,
				this.climbPos.getZ() + 0.5D
		);
		if (!this.climbing) {
			this.approachTicks++;
			if (!this.reachedApproach()) {
				this.moveToApproach();
				return;
			}
			this.climbing = true;
			this.nextMoveTick = 0;
			this.squirrel.getNavigation().stop();
		}

		this.squirrel.setTreeClimbing(true);
		if (SquirrelTreeClimbPolicy.reachedHeight(this.squirrel.getY(), this.climbPos.getY())) {
			this.squirrel.getNavigation().stop();
			this.squirrel.setFoundTree(true);
			this.squirrel.setNoGravity(true);
			this.squirrel.resetFallDistance();
			this.squirrel.setDeltaMovement(SquirrelTreeClimbPolicy.clingMovement(
					this.squirrel.position(),
					this.climbPos
			));
			return;
		}

		this.squirrel.setFoundTree(false);
		this.squirrel.setNoGravity(false);
		// Keep pressing into the trunk center from the chosen clear face. Native
		// collision and onClimbable provide the ascent; a new ground path here
		// would send us around the trunk instead of maintaining wall contact.
		Vec3 target = Vec3.atCenterOf(this.climbPos);
		this.squirrel.getMoveControl().setWantedPosition(target.x, target.y, target.z, CLIMB_SPEED);
	}

	private boolean reachedApproach() {
		return this.squirrel.distanceToSqr(Vec3.atBottomCenterOf(this.approachPos))
				<= REACHED_APPROACH_DISTANCE_SQR;
	}

	private void moveToApproach() {
		var navigation = this.squirrel.getNavigation();
		if (--this.nextMoveTick <= 0) {
			// Recheck changed terrain, including during the last short step. A
			// cached reachable path does not prove a new wall can be crossed.
			navigation.stop();
			var path = navigation.createPath(this.approachPos, 0);
			if (path == null || !path.canReach()) {
				this.approachFailed = true;
				this.nextSearchTick = 0;
				return;
			}
			navigation.moveTo(path, 1.35D);
			this.nextMoveTick = 10;
		}

		// Native completion allows more slack than a clean climbing face.
		// Finish this collision-checked final step only on a verified path.
		Vec3 target = Vec3.atBottomCenterOf(this.approachPos);
		var path = navigation.getPath();
		if (navigation.isDone() && path != null && path.canReach()
				&& path.getTarget().equals(this.approachPos) && this.squirrel.distanceToSqr(target) <= 1.0D) {
			this.squirrel.getMoveControl().setWantedPosition(target.x, target.y, target.z, CLIMB_SPEED);
		}
	}

	private void findNearestTree() {
		BlockPos origin = this.squirrel.blockPosition();
		BlockPos min = origin.offset(-SEARCH_RADIUS, -SEARCH_Y_RADIUS, -SEARCH_RADIUS);
		BlockPos max = origin.offset(SEARCH_RADIUS, SEARCH_Y_RADIUS, SEARCH_RADIUS);
		double nearestDistance = Double.MAX_VALUE;
		this.treePos = null;
		this.approachPos = null;
		this.climbPos = null;

		for (BlockPos candidate : BlockPos.betweenClosed(min, max)) {
			if (!this.squirrel.level().getBlockState(candidate).is(BlockTags.LOGS)) {
				continue;
			}
			double distance = candidate.distSqr(origin);
			if (distance >= nearestDistance) {
				continue;
			}

			BlockPos approach = this.findApproach(candidate, origin);
			if (approach == null) {
				continue;
			}
			BlockPos climb = findClimbTarget(this.squirrel.level(), candidate, approach);
			if (climb == null) {
				continue;
			}

			this.treePos = candidate.immutable();
			this.approachPos = approach;
			this.climbPos = climb;
			nearestDistance = distance;
		}
	}

	private static BlockPos findClimbTarget(Level level, BlockPos tree, BlockPos approach) {
		BlockPos target = null;
		for (int height = 1; height <= MAX_CLIMB_BLOCKS; height++) {
			BlockPos trunk = tree.above(height);
			// A canopy can cover the trunk's upper faces. Stop below it rather than
			// asking wall-climber navigation to reach a height inside solid leaves.
			BlockPos climbingSpace = approach.above(height);
			if (!level.getBlockState(trunk).is(BlockTags.LOGS)
					|| !level.getBlockState(climbingSpace).isAir()) {
				break;
			}
			if (height >= MIN_CLIMB_BLOCKS) {
				target = trunk.immutable();
			}
		}
		return target;
	}

	private BlockPos findApproach(BlockPos tree, BlockPos origin) {
		Level level = this.squirrel.level();
		BlockPos closest = null;
		double closestDistance = Double.MAX_VALUE;
		for (Direction direction : APPROACH_DIRECTIONS) {
			BlockPos candidate = tree.relative(direction);
			// Standing beside a trunk is insufficient: a low branch can block
			// this face while another approach still offers a usable climb.
			if (!isStandable(level, candidate) || findClimbTarget(level, tree, candidate) == null) {
				continue;
			}

			double distance = candidate.distSqr(origin);
			if (distance < closestDistance) {
				// A standable face behind a wall is not a usable escape route.
				// Require the native path to reach this exact face, not a partial endpoint.
				var path = this.squirrel.getNavigation().createPath(candidate, 0);
				if (path == null || !path.canReach()) {
					continue;
				}
				closest = candidate.immutable();
				closestDistance = distance;
			}
		}
		return closest;
	}

	private static boolean isStandable(Level level, BlockPos pos) {
		BlockPos floor = pos.below();
		return level.getBlockState(pos).isAir()
				&& level.getBlockState(pos.above()).isAir()
				&& level.getBlockState(floor).isFaceSturdy(level, floor, Direction.UP);
	}
}
