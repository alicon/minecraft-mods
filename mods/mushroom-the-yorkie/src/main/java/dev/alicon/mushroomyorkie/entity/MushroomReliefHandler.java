package dev.alicon.mushroomyorkie.entity;

import net.minecraft.server.level.ServerLevel;

final class MushroomReliefHandler {
	static final int RELIEF_TICKS = 20 * 4;

	private MushroomReliefHandler() {
	}

	static void tick(MushroomYorkieEntity yorkie, ServerLevel level) {
		long day = MushroomNightBehavior.currentDay(level);
		if (!yorkie.isTame()
				|| !yorkie.needs.shouldWarnPotty()
				|| !yorkie.relief.shouldAskToday(day, true)
				|| !level.canSeeSky(yorkie.blockPosition())) {
			yorkie.relief.resetOutdoorRelief();
			return;
		}

		if (!yorkie.relief.tickOutdoorRelief()) {
			return;
		}

		yorkie.needs.relieveOutside();
		yorkie.relief.recordRelief(day);
		MushroomYorkieSounds.bark(yorkie);
		MushroomOwnerNotice.send(yorkie, "message.mushroom_yorkie.notice_relieved", MushroomOwnerNotice.MEDIUM_COOLDOWN_TICKS);
		MushroomBehaviorDebugger.debug(yorkie, "potty_relieved", "potty: relieved outside and reset for the day", true);
	}
}
