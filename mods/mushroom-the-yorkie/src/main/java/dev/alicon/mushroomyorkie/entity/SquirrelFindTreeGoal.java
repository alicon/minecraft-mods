package dev.alicon.mushroomyorkie.entity;

import java.util.EnumSet;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.tags.BlockTags;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.entity.ai.navigation.GroundPathNavigation;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;

final class SquirrelFindTreeGoal extends Goal {
	private static final int SEARCH_RADIUS = 20;
	private static final int SEARCH_Y_RADIUS = 5;
	static final int MIN_CLIMB_BLOCKS = 2;
	static final int MAX_CLIMB_BLOCKS = 4;
	// Reach the selected face before climbing; a loose corner radius can hit a blocked neighbor face.
	private static final double REACHED_APPROACH_DISTANCE_SQR = 0.09D;
	// Wall contact needs slower horizontal steering than the run to the tree.
	private static final double CLIMB_SPEED = 0.45D;
	// A nearby tree gets at most ten seconds of approach, even if terrain changes.
	private static final int MAX_APPROACH_TICKS = 200;
	// Keep established perches stable for nine seconds before exploring the crown.
	private static final int PERCH_BEFORE_EXPLORING_TICKS = 20 * 9;
	private static final int AVOID_LAST_TREE_TICKS = 20 * 20;
	private static final Direction[] APPROACH_DIRECTIONS = {
		Direction.NORTH, Direction.SOUTH, Direction.WEST, Direction.EAST
	};

	private final SquirrelEntity squirrel;
	private final GroundPathNavigation reachabilityProbe;
	private final SquirrelTreeTravel treeTravel;
	private BlockPos treePos;
	private BlockPos approachPos;
	private BlockPos climbPos;
	private boolean climbing;
	private int nextSearchTick;
	private int nextMoveTick;
	private int approachTicks;
	private boolean approachFailed;
	private boolean recoveredCling;
	private int perchTicks;
	private BlockPos previousTree;
	private long previousTreeUntil;

	SquirrelFindTreeGoal(SquirrelEntity squirrel) {
		this.squirrel = squirrel;
		// Selection queries must not overwrite another goal's navigation target
		// or stuck timer. This ordinary ground navigator is queried, never ticked.
		this.reachabilityProbe = new GroundPathNavigation(squirrel, squirrel.level());
		this.treeTravel = new SquirrelTreeTravel(squirrel);
		this.setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK));
	}

	@Override
	public boolean canUse() {
		this.recoveredCling = false;
		if (this.squirrel.hurtTime > 0) {
			// A saved perch cannot suppress an in-progress native damage reaction.
			if (!this.squirrel.hasFoundTree()) this.squirrel.setNoGravity(false);
			return false;
		}
		// Native NoGravity survives saving but the selected goal does not. A
		// physically intact perch can be reclaimed without a fall/re-approach.
		if (this.squirrel.isNoGravity() && !this.squirrel.hasFoundTree()) {
			var perch = SquirrelPerchRecovery.find(this.squirrel);
			if (perch != null) {
				this.treePos = perch.tree();
				this.approachPos = perch.approach();
				this.climbPos = perch.climb();
				this.recoveredCling = true;
				return true;
			}
			// A missing/blocked tree cannot grant permanent hovering.
			this.squirrel.setNoGravity(false);
		}
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
		if (this.squirrel.hurtTime > 0) {
			this.nextSearchTick = 0;
			return false;
		}
		if (this.treeTravel.active() || this.treeTravel.finished()) return this.treeTravel.active();
		if (this.climbing && this.squirrel.hasFoundTree()) {
			// Holding and recovering a perch use the same physical support rule;
			// an obsolete run-up anchor cannot change the outcome after a reload.
			return this.climbPos != null && SquirrelPerchRecovery.supports(this.squirrel, this.climbPos);
		}
		boolean valid = this.treePos != null
				&& !this.approachFailed
				&& (this.climbing || this.approachTicks < MAX_APPROACH_TICKS)
				&& this.approachPos != null
				&& this.climbPos != null
				&& this.squirrel.level().getBlockState(this.treePos).is(BlockTags.LOGS)
				&& this.squirrel.level().getBlockState(this.climbPos).is(BlockTags.LOGS)
				&& (this.climbing || isStandable(this.squirrel.level(), this.approachPos));
		if (!valid) return false;
		// A new branch/block can close the selected face after ground navigation
		// hands off. Release the ascent instead of pressing into it indefinitely.
		// An established perch need not fall because terrain below it changed.
		if (this.climbing && !this.squirrel.hasFoundTree()
				&& !this.remainingClimbIsClear()) {
			this.nextSearchTick = 0;
			return false;
		}
		return true;
	}

	private boolean remainingClimbIsClear() {
		// Opening a taller route or changing terrain already passed must not
		// release a sound ascent. Validate only the remainder of this target.
		int fromY = Math.max(this.treePos.getY(), (int) Math.floor(this.squirrel.getY()));
		for (int y = fromY; y <= this.climbPos.getY(); y++) {
			BlockPos trunk = new BlockPos(this.treePos.getX(), y, this.treePos.getZ());
			BlockPos space = new BlockPos(this.approachPos.getX(), y, this.approachPos.getZ());
			if (!this.squirrel.level().getBlockState(trunk).is(BlockTags.LOGS)
					|| !this.squirrel.level().getBlockState(space).isAir()) return false;
		}
		return true;
	}

	@Override
	public boolean requiresUpdateEveryTick() {
		return true;
	}

	@Override
	public void start() {
		this.climbing = this.recoveredCling;
		this.squirrel.setFoundTree(this.recoveredCling);
		this.squirrel.setTreeClimbing(this.recoveredCling);
		this.squirrel.setNoGravity(this.recoveredCling);
		this.nextMoveTick = 0;
		this.approachTicks = 0;
		this.approachFailed = false;
		this.perchTicks = 0;
	}

	@Override
	public void stop() {
		if (this.treeTravel.vacatedTree() != null) {
			this.previousTree = this.treeTravel.vacatedTree();
			this.previousTreeUntil = this.squirrel.level().getGameTime() + AVOID_LAST_TREE_TICKS;
			this.nextSearchTick = 0;
		}
		this.treeTravel.reset();
		this.recoveredCling = false;
		this.treePos = null;
		this.approachPos = null;
		this.climbPos = null;
		this.climbing = false;
		this.releaseClimbingPhysics();
		this.squirrel.getNavigation().stop();
	}

	private void releaseClimbingPhysics() {
		this.squirrel.setFoundTree(false);
		this.squirrel.setTreeClimbing(false);
		this.squirrel.setNoGravity(false);
	}

	@Override
	public void tick() {
		if (this.squirrel.hurtTime > 0) {
			// Goal cleanup is not scheduled on every entity tick. Release now,
			// before cling steering can overwrite the hit's real momentum.
			this.approachFailed = true;
			this.nextSearchTick = 0;
			this.releaseClimbingPhysics();
			this.squirrel.getNavigation().stop();
			return;
		}
		if (this.treeTravel.active()) {
			this.treeTravel.tick();
			return;
		}
		if (this.treeTravel.finished()) return;
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
			if (++this.perchTicks >= PERCH_BEFORE_EXPLORING_TICKS) {
				this.perchTicks = 0;
				this.treeTravel.start(this.treePos);
			}
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
		// Ground navigation cannot plan while airborne. Keep the valid approach
		// and its movement across a real jump/drop, then refresh after landing.
		if (!this.squirrel.onGround()) {
			return;
		}
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
		this.reachabilityProbe.setCanFloat(this.squirrel.getNavigation().canFloat());
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
			if (this.previousTree != null && this.squirrel.level().getGameTime() < this.previousTreeUntil
					&& candidate.getX() == this.previousTree.getX() && candidate.getZ() == this.previousTree.getZ()) continue;
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

	static BlockPos findClimbTarget(Level level, BlockPos tree, BlockPos approach) {
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
				var path = this.reachabilityProbe.createPath(candidate, 0);
				if (path == null || !path.canReach() || !path.getTarget().equals(candidate)) {
					continue;
				}
				closest = candidate.immutable();
				closestDistance = distance;
			}
		}
		return closest;
	}

	static boolean isStandable(Level level, BlockPos pos) {
		BlockPos floor = pos.below();
		return level.getBlockState(pos).isAir()
				&& level.getBlockState(pos.above()).isAir()
				&& level.getBlockState(floor).isFaceSturdy(level, floor, Direction.UP);
	}
}
