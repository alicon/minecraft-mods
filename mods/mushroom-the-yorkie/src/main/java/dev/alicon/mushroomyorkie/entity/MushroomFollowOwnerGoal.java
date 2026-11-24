package dev.alicon.mushroomyorkie.entity;

import net.minecraft.core.BlockPos;
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
		BlockPos belowFeet = BlockPos.containing(owner.getX(), owner.getY() - 0.05D, owner.getZ());
		return !owner.level().getBlockState(belowFeet).getCollisionShape(owner.level(), belowFeet).isEmpty();
	}
}
