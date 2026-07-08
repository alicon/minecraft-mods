package dev.alicon.copsrobbers.entity;

final class BankRobberSchedulePolicy {
	private static final long DAY_TICKS = 24_000L;
	private static final long DAYTIME_START = 1_000L;
	private static final long DAYTIME_END = 12_000L;
	private static final long NIGHT_START = 13_000L;
	private static final long NIGHT_END = 23_000L;
	private static final long SENTENCE_TICKS = DAY_TICKS;
	private static final long JAILBREAK_MIN_TICKS = 600L;

	private BankRobberSchedulePolicy() {
	}

	static boolean isDaytime(long dayTime) {
		long timeOfDay = timeOfDay(dayTime);
		return timeOfDay >= DAYTIME_START && timeOfDay <= DAYTIME_END;
	}

	static boolean isNight(long dayTime) {
		long timeOfDay = timeOfDay(dayTime);
		return timeOfDay >= NIGHT_START && timeOfDay <= NIGHT_END;
	}

	static boolean hasServedSentence(boolean jailed, long currentGameTime, long jailedAtTime) {
		return jailed && currentGameTime - jailedAtTime >= SENTENCE_TICKS;
	}

	static boolean canJailbreak(boolean specialJailbreaker, long currentGameTime, long jailedAtTime, long dayTime) {
		return specialJailbreaker
				&& isNight(dayTime)
				&& currentGameTime - jailedAtTime > JAILBREAK_MIN_TICKS;
	}

	static long day(long dayTime) {
		return dayTime / DAY_TICKS;
	}

	private static long timeOfDay(long dayTime) {
		return Math.floorMod(dayTime, DAY_TICKS);
	}
}
