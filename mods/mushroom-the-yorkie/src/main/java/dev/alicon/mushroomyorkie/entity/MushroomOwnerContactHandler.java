package dev.alicon.mushroomyorkie.entity;

import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.LivingEntity;

final class MushroomOwnerContactHandler {
	private static final int OWNER_CONTACT_DISTANCE_BLOCKS = 48;
	private static final int OWNER_NEGLECT_DISTANCE_BLOCKS = 32;

	private MushroomOwnerContactHandler() {
	}

	static void tick(MushroomYorkieEntity yorkie, ServerLevel level) {
		if (ownerWithin(yorkie, OWNER_CONTACT_DISTANCE_BLOCKS)) {
			yorkie.recordOwnerContact(level);
		}
	}

	static boolean ownerIsCloseEnoughForNeglect(MushroomYorkieEntity yorkie) {
		return ownerWithin(yorkie, OWNER_NEGLECT_DISTANCE_BLOCKS);
	}

	private static boolean ownerWithin(MushroomYorkieEntity yorkie, int blocks) {
		LivingEntity owner = yorkie.getOwner();
		return owner != null
				&& owner.level() == yorkie.level()
				&& yorkie.distanceToSqr(owner) <= blocks * blocks;
	}
}
