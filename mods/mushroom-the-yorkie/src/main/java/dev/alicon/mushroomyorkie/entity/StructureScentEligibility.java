package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.MushroomStructureScentConfig;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;

final class StructureScentEligibility {
	private StructureScentEligibility() {
	}

	static boolean canSniff(ServerLevel level, MushroomYorkieEntity yorkie, MushroomStructureScentConfig config) {
		LivingEntity owner = yorkie.getOwner();
		if (!(owner instanceof Player player)) {
			return false;
		}

		return config.enabled()
				&& yorkie.isTame()
				&& player.level() == yorkie.level()
				&& !player.isCreative()
				&& !yorkie.isOrderedToSit()
				&& !yorkie.isMushroomSleeping()
				&& !MushroomNightBehavior.shouldAskToGoOutside(yorkie, level)
				&& yorkie.scaredRunTicks <= 0;
	}
}
