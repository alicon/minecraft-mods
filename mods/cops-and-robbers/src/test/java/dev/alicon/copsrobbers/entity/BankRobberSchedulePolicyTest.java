package dev.alicon.copsrobbers.entity;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

final class BankRobberSchedulePolicyTest {
	@Test
	void daytimeWindowMatchesRobberyHours() {
		assertTrue(BankRobberSchedulePolicy.isDaytime(1_000L));
		assertTrue(BankRobberSchedulePolicy.isDaytime(12_000L));
		assertFalse(BankRobberSchedulePolicy.isDaytime(999L));
		assertFalse(BankRobberSchedulePolicy.isDaytime(12_001L));
	}

	@Test
	void nightWindowMatchesJailbreakHours() {
		assertTrue(BankRobberSchedulePolicy.isNight(13_000L));
		assertTrue(BankRobberSchedulePolicy.isNight(23_000L));
		assertFalse(BankRobberSchedulePolicy.isNight(12_999L));
		assertFalse(BankRobberSchedulePolicy.isNight(23_001L));
	}

	@Test
	void servedSentenceRequiresJailedStateAndFullMinecraftDay() {
		assertFalse(BankRobberSchedulePolicy.hasServedSentence(false, 48_000L, 0L));
		assertFalse(BankRobberSchedulePolicy.hasServedSentence(true, 23_999L, 0L));
		assertTrue(BankRobberSchedulePolicy.hasServedSentence(true, 24_000L, 0L));
	}

	@Test
	void jailbreakRequiresSpecialPrisonerNightAndWarmup() {
		assertFalse(BankRobberSchedulePolicy.canJailbreak(false, 1_000L, 0L, 13_000L));
		assertFalse(BankRobberSchedulePolicy.canJailbreak(true, 600L, 0L, 13_000L));
		assertFalse(BankRobberSchedulePolicy.canJailbreak(true, 1_000L, 0L, 12_000L));
		assertTrue(BankRobberSchedulePolicy.canJailbreak(true, 601L, 0L, 13_000L));
	}
}
