package dev.alicon.mushroomyorkie.entity;

import net.minecraft.core.BlockPos;
import net.minecraft.tags.FluidTags;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.goal.FollowOwnerGoal;

/** Lets a breathing swimmer follow a nearby owner onto a shallow bank. */
final class MushroomFollowOwnerGoal extends FollowOwnerGoal {
	private static final float NORMAL_START_DISTANCE_BLOCKS = 2.0F;
	private static final float STOP_DISTANCE_BLOCKS = 1.0F;
	private final MushroomYorkieEntity yorkie;

	MushroomFollowOwnerGoal(MushroomYorkieEntity yorkie) {
		super(yorkie, 1.25D, STOP_DISTANCE_BLOCKS, STOP_DISTANCE_BLOCKS);
		this.yorkie = yorkie;
	}

	@Override
	public boolean canUse() {
		LivingEntity owner = this.yorkie.getOwner();
		if (owner == null) {
			return false;
		}
		double distanceSquared = this.yorkie.distanceToSqr(owner);
		if (distanceSquared >= NORMAL_START_DISTANCE_BLOCKS * NORMAL_START_DISTANCE_BLOCKS) {
			return super.canUse();
		}
		// A path can end on the wet side of a slab within the normal start radius.
		// Reuse native following and collision to take the remaining dryward step.
		return distanceSquared > STOP_DISTANCE_BLOCKS * STOP_DISTANCE_BLOCKS
				&& this.yorkie.isInWater() && !this.yorkie.isUnderWater() && !this.yorkie.isPassenger()
				&& owner.level() == this.yorkie.level() && owner.getY() > this.yorkie.getY()
				&& !MushroomYorkieStateQueries.ownerIsCreativeFlying(this.yorkie)
				&& hasDryBankSupport(owner) && super.canUse();
	}

	private static boolean hasDryBankSupport(LivingEntity owner) {
		if (!owner.onGround() || owner.isInWater() || owner.isPassenger()) {
			return false;
		}
		return hasBlockSupport(owner);
	}

	@Override
	public boolean canContinueToUse() {
		var path = this.yorkie.getNavigation().getPath();
		if (path != null && !path.canReach() && path.getNodeCount() == 1 && this.hasDryFooting()) {
			BlockPos node = path.getNodePos(0);
			BlockPos feet = this.yorkie.blockPosition();
			// A float-start path from this dry slab can be one node underneath it.
			// Let the goal clear that unusable path and start a new grounded route.
			if (node.getX() == feet.getX() && node.getZ() == feet.getZ() && node.getY() < feet.getY()) {
				return false;
			}
		}
		return super.canContinueToUse();
	}

	@Override
	public void tick() {
		var navigation = this.yorkie.getNavigation();
		if (!navigation.canFloat() || !this.yorkie.isInWater() || !this.hasDryFooting()) {
			super.tick();
			return;
		}
		// The body still touches water beside the slab. Plan from the supported
		// feet to avoid a submerged start below it, then restore ordinary swimming.
		navigation.setCanFloat(false);
		try {
			super.tick();
		} finally {
			navigation.setCanFloat(true);
		}
	}

	private boolean hasDryFooting() {
		return this.yorkie.onGround() && !this.yorkie.isPassenger()
				&& !this.yorkie.level().getFluidState(this.yorkie.blockPosition()).is(FluidTags.WATER)
				&& hasBlockSupport(this.yorkie);
	}

	private static boolean hasBlockSupport(LivingEntity entity) {
		BlockPos belowFeet = BlockPos.containing(entity.getX(), entity.getY() - 0.05D, entity.getZ());
		return !entity.level().getBlockState(belowFeet).getCollisionShape(entity.level(), belowFeet).isEmpty();
	}
}
