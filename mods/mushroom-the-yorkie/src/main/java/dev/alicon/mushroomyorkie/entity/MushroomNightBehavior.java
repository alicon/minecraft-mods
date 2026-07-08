package dev.alicon.mushroomyorkie.entity;

import net.minecraft.server.level.ServerLevel;

final class MushroomNightBehavior {
	private static final int NIGHT_START = 13_000;
	private static final int NIGHT_END = 23_000;

	private MushroomNightBehavior() {
	}

	static void tick(MushroomYorkieEntity yorkie, ServerLevel level) {
		boolean sleepingAtNight = shouldSleepAtNight(yorkie, level);
		if (!sleepingAtNight && !MushroomBehaviorProfiles.keepsCreativeBuilderFocus(yorkie, level)) {
			yorkie.setSleeping(false);
			if (!isNight(level)) {
				yorkie.nightWakeTicks = 0;
			}
			return;
		}

		if (yorkie.nightWakeTicks > 0) {
			yorkie.nightWakeTicks--;
			yorkie.setSleeping(false);
		}
	}

	static boolean shouldSleepAtNight(MushroomYorkieEntity yorkie, ServerLevel level) {
		return yorkie.isTame() && !MushroomYorkieStateQueries.ownerIsCreativeFlying(yorkie) && isNight(level) && isInside(level, yorkie);
	}

	static boolean shouldAskToGoOutside(MushroomYorkieEntity yorkie, ServerLevel level) {
		return yorkie.isTame()
				&& !yorkie.isOrderedToSit()
				&& !MushroomYorkieStateQueries.ownerIsCreativeFlying(yorkie)
				&& !shouldSleepAtNight(yorkie, level)
				&& isInside(level, yorkie)
				&& yorkie.relief.shouldAskToday(currentDay(level), yorkie.needs.shouldWarnPotty());
	}

	static long currentDay(ServerLevel level) {
		return level.getDayTime() / 24_000L;
	}

	private static boolean isNight(ServerLevel level) {
		long dayTime = level.getDayTime() % 24_000L;
		return dayTime >= NIGHT_START && dayTime <= NIGHT_END;
	}

	private static boolean isInside(ServerLevel level, MushroomYorkieEntity yorkie) {
		return MushroomShelterDetector.isSheltered(level, yorkie.blockPosition());
	}
}
