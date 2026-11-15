package dev.alicon.mushroomyorkie.entity;

import net.minecraft.tags.FluidTags;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;

final class MushroomYorkieStateQueries {
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
		// A jump can briefly clear the water flag before reaching land; do not stop recovery midair.
		return yorkie.onGround() && !isWetForSitting(yorkie);
	}

	static boolean isWetForSitting(MushroomYorkieEntity yorkie) {
		return yorkie.isInWater() || yorkie.level().getFluidState(yorkie.blockPosition()).is(FluidTags.WATER);
	}
}
