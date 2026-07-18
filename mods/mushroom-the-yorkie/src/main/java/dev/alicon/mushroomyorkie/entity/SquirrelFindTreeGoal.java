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
	private static final double REACHED_APPROACH_DISTANCE_SQR = 1.8D;
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

	SquirrelFindTreeGoal(SquirrelEntity squirrel) {
		this.squirrel = squirrel;
		this.setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK));
	}

	@Override
	public boolean canUse() {
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
			if (!this.reachedApproach()) {
				this.moveTo(Vec3.atBottomCenterOf(this.approachPos));
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
		this.moveTo(Vec3.atCenterOf(this.climbPos));
	}

	private boolean reachedApproach() {
		return this.squirrel.distanceToSqr(Vec3.atBottomCenterOf(this.approachPos))
				<= REACHED_APPROACH_DISTANCE_SQR;
	}

	private void moveTo(Vec3 target) {
		if (this.nextMoveTick-- > 0 && !this.squirrel.getNavigation().isDone()) {
			return;
		}

		this.squirrel.getNavigation().moveTo(target.x, target.y, target.z, 1.35D);
		this.nextMoveTick = 10;
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

			BlockPos approach = findApproach(this.squirrel.level(), candidate, origin);
			if (approach == null) {
				continue;
			}
			BlockPos climb = findClimbTarget(this.squirrel.level(), candidate);
			if (climb == null) {
				continue;
			}

			double distance = candidate.distSqr(origin);
			if (distance < nearestDistance) {
				this.treePos = candidate.immutable();
				this.approachPos = approach;
				this.climbPos = climb;
				nearestDistance = distance;
			}
		}
	}

	private static BlockPos findClimbTarget(Level level, BlockPos tree) {
		BlockPos target = null;
		for (int height = 1; height <= MAX_CLIMB_BLOCKS; height++) {
			BlockPos trunk = tree.above(height);
			if (!level.getBlockState(trunk).is(BlockTags.LOGS)) {
				break;
			}
			if (height >= MIN_CLIMB_BLOCKS) {
				target = trunk.immutable();
			}
		}
		return target;
	}

	private static BlockPos findApproach(Level level, BlockPos tree, BlockPos origin) {
		BlockPos closest = null;
		double closestDistance = Double.MAX_VALUE;
		for (Direction direction : APPROACH_DIRECTIONS) {
			BlockPos candidate = tree.relative(direction);
			if (!isStandable(level, candidate)) {
				continue;
			}

			double distance = candidate.distSqr(origin);
			if (distance < closestDistance) {
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
