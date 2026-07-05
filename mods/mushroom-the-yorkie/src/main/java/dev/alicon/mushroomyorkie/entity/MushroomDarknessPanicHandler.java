package dev.alicon.mushroomyorkie.entity;

import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;

final class MushroomDarknessPanicHandler {
	private static final int OWNER_LEFT_DISTANCE_BLOCKS = 24;
	private static final int BARK_INTERVAL_TICKS = 20;
	private static final int OWNER_MESSAGE_INTERVAL_TICKS = 20 * 8;

	private MushroomDarknessPanicHandler() {
	}

	static void tick(MushroomYorkieEntity yorkie, ServerLevel level) {
		if (!shouldPanic(yorkie, level)) {
			yorkie.darkPanicTicks = 0;
			return;
		}

		yorkie.darkPanicTicks++;
		if (yorkie.darkPanicTicks % BARK_INTERVAL_TICKS == 0) {
			yorkie.bark();
		}

		if (yorkie.darkPanicTicks % OWNER_MESSAGE_INTERVAL_TICKS == 0 && yorkie.getOwner() instanceof Player owner) {
			owner.displayClientMessage(Component.translatable("message.mushroom_yorkie.trapped_dark"), true);
		}

		MushroomBehaviorDebugger.debug(yorkie, "trapped_dark", "darkness: abandoned in complete darkness", false);
	}

	private static boolean shouldPanic(MushroomYorkieEntity yorkie, ServerLevel level) {
		if (!yorkie.isTame()
				|| yorkie.isOrderedToSit()
				|| yorkie.isMushroomSleeping()
				|| yorkie.ownerIsCreativeFlying()
				|| !isDay(level)
				|| level.canSeeSky(yorkie.blockPosition())
				|| level.getRawBrightness(yorkie.blockPosition(), 0) > 0) {
			return false;
		}

		LivingEntity owner = yorkie.getOwner();
		if (owner == null || owner.level() != yorkie.level()) {
			return true;
		}

		return yorkie.distanceToSqr(owner) > OWNER_LEFT_DISTANCE_BLOCKS * OWNER_LEFT_DISTANCE_BLOCKS;
	}

	private static boolean isDay(ServerLevel level) {
		long dayTime = level.getDayTime() % 24_000L;
		return dayTime < 13_000L || dayTime > 23_000L;
	}
}
