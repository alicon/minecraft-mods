package dev.alicon.mushroomyorkie.entity;

import net.minecraft.server.level.ServerLevel;

final class MushroomNeedDecayHandler {
	private static final int RESTING_HUNGER_INTERVALS = 4;
	private static final int STARVING_DAMAGE_INTERVAL_TICKS = 20 * 30;

	private MushroomNeedDecayHandler() {
	}

	static void tick(MushroomYorkieEntity yorkie, ServerLevel level) {
		if (yorkie.tickCount % MushroomYorkieEntity.NEEDS_INTERVAL_TICKS == 0) {
			boolean resting = yorkie.isOrderedToSit() || yorkie.isMushroomSleeping() || MushroomBehaviorProfiles.shouldRestLikeSitting(yorkie, level);
			yorkie.needs.tickNeeds(level.canSeeSky(yorkie.blockPosition()), resting, shouldSpendHunger(yorkie, resting));
		}

		if (yorkie.isTame()
				&& yorkie.needs.isStarving()
				&& MushroomOwnerContactHandler.ownerIsCloseEnoughForNeglect(yorkie)
				&& yorkie.tickCount % STARVING_DAMAGE_INTERVAL_TICKS == 0) {
			yorkie.whine();
			MushroomOwnerNotice.send(yorkie, "message.mushroom_yorkie.notice_hungry_critical", STARVING_DAMAGE_INTERVAL_TICKS);
			yorkie.hurtFromNeglect(level, 1.0F);
			MushroomBehaviorDebugger.debug(yorkie, "starving", "needs: food bar is empty", true);
		}
	}

	private static boolean shouldSpendHunger(MushroomYorkieEntity yorkie, boolean resting) {
		return !resting || yorkie.tickCount % (MushroomYorkieEntity.NEEDS_INTERVAL_TICKS * RESTING_HUNGER_INTERVALS) == 0;
	}
}
