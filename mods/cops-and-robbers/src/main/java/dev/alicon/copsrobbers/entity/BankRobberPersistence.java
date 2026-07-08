package dev.alicon.copsrobbers.entity;

import net.minecraft.world.InteractionHand;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;

final class BankRobberPersistence {
	private static final String JAILED_TAG = "jailed";
	private static final String SPECIAL_JAILBREAKER_TAG = "special_jailbreaker";
	private static final String JAILED_AT_TIME_TAG = "jailed_at_time";
	private static final String STOLEN_GOLD_TAG = "stolen_gold";
	private static final String BANK_FIRE_LIT_TAG = "bank_fire_lit";
	private static final String ROBBERIES_TODAY_TAG = "robberies_today";
	private static final String LAST_ROBBERY_DAY_TAG = "last_robbery_day";
	private static final String CHILL_UNTIL_TICK_TAG = "chill_until_tick";

	private BankRobberPersistence() {
	}

	static void save(BankRobberEntity robber, ValueOutput output) {
		output.putBoolean(JAILED_TAG, robber.jailed);
		output.putBoolean(SPECIAL_JAILBREAKER_TAG, robber.specialJailbreaker);
		output.putBoolean(STOLEN_GOLD_TAG, robber.hasStolenGold());
		output.putBoolean(BANK_FIRE_LIT_TAG, robber.bankFireLit);
		output.putLong(JAILED_AT_TIME_TAG, robber.jailedAtTime);
		output.putInt(ROBBERIES_TODAY_TAG, robber.robberiesToday);
		output.putLong(LAST_ROBBERY_DAY_TAG, robber.lastRobberyDay);
		output.putLong(CHILL_UNTIL_TICK_TAG, robber.chillUntilTick);
	}

	static void read(BankRobberEntity robber, ValueInput input) {
		robber.jailed = input.getBooleanOr(JAILED_TAG, false);
		robber.specialJailbreaker = input.getBooleanOr(SPECIAL_JAILBREAKER_TAG, false);
		robber.setStolenGoldCarried(input.getBooleanOr(STOLEN_GOLD_TAG, false));
		robber.bankFireLit = input.getBooleanOr(BANK_FIRE_LIT_TAG, false);
		robber.jailedAtTime = input.getLongOr(JAILED_AT_TIME_TAG, 0L);
		robber.robberiesToday = input.getIntOr(ROBBERIES_TODAY_TAG, 0);
		robber.lastRobberyDay = input.getLongOr(LAST_ROBBERY_DAY_TAG, -1L);
		robber.chillUntilTick = input.getLongOr(CHILL_UNTIL_TICK_TAG, 0L);
	}

	static void syncStolenGoldItem(BankRobberEntity robber, boolean stolen) {
		robber.setItemInHand(InteractionHand.MAIN_HAND, stolen ? new ItemStack(Items.GOLD_INGOT) : ItemStack.EMPTY);
	}
}
