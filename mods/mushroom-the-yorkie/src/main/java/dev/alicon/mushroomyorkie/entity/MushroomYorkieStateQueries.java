package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.block.ModBlocks;
import net.minecraft.tags.FluidTags;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.phys.AABB;

final class MushroomYorkieStateQueries {
	private static final double REST_SUPPORT_RADIUS_BLOCKS = 0.01D;
	private static final double REST_SUPPORT_DEPTH_BLOCKS = 0.05D;
	// The non-colliding doghouse places sleepers on a visual bed a quarter block above its floor.
	private static final double DOGHOUSE_REST_SUPPORT_DEPTH_BLOCKS = 0.3D;
	private MushroomYorkieStateQueries() {
	}

	static boolean ownerIsCreativeFlying(MushroomYorkieEntity yorkie) {
		LivingEntity owner = yorkie.getOwner();
		return owner instanceof Player player && player.isCreative() && player.getAbilities().flying;
	}

	static boolean ownerIsCreative(MushroomYorkieEntity yorkie) {
		LivingEntity owner = yorkie.getOwner();
		return owner instanceof Player player && player.isCreative() && owner.level() == yorkie.level();
	}

	static boolean canSleep(MushroomYorkieEntity yorkie) {
		boolean doghouseAnchor = yorkie.level().getBlockState(yorkie.blockPosition()).is(ModBlocks.DOGHOUSE);
		if ((!yorkie.onGround() && !(doghouseAnchor && yorkie.isMushroomSleeping())) || isWetForSitting(yorkie)) {
			return false;
		}
		// Partial bank contact can set onGround while the center remains over water. Require support under the feet.
		var feet = yorkie.position();
		double depth = doghouseAnchor ? DOGHOUSE_REST_SUPPORT_DEPTH_BLOCKS : REST_SUPPORT_DEPTH_BLOCKS;
		AABB support = new AABB(feet.x - REST_SUPPORT_RADIUS_BLOCKS, feet.y - depth, feet.z - REST_SUPPORT_RADIUS_BLOCKS,
				feet.x + REST_SUPPORT_RADIUS_BLOCKS, feet.y, feet.z + REST_SUPPORT_RADIUS_BLOCKS);
		return !yorkie.level().noCollision(yorkie, support);
	}

	static boolean isWetForSitting(MushroomYorkieEntity yorkie) {
		return yorkie.isInWater() || yorkie.level().getFluidState(yorkie.blockPosition()).is(FluidTags.WATER);
	}
}
