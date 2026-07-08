package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.pet.PetNeeds;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;

final class MushroomYorkiePersistence {
	private static final String HUNGER_KEY = "Hunger", POTTY_KEY = "Potty", MOOD_KEY = "Mood", ENERGY_KEY = "Energy";
	private static final String NIGHT_WAKE_TICKS_KEY = "NightWakeTicks", HARNESS_KEY = "Harness";
	private static final String PEACEFUL_MOB_BARK_MUTED_UNTIL_KEY = "PeacefulMobBarkMutedUntil";
	private static final String LAST_FOOD_BOWL_DAY_KEY = "LastFoodBowlDay", LAST_WATER_BOWL_DAY_KEY = "LastWaterBowlDay";
	private static final String LAST_OWNER_CONTACT_GAME_TIME_KEY = "LastOwnerContactGameTime";
	private static final String LAST_RELIEF_DAY_KEY = "LastReliefDay", CALMED_PEACEFUL_MOBS_KEY = "CalmedPeacefulMobs";

	private MushroomYorkiePersistence() {
	}

	static void save(MushroomYorkieEntity yorkie, ValueOutput output) {
		output.putInt(HUNGER_KEY, yorkie.needs.hunger());
		output.putInt(POTTY_KEY, yorkie.needs.potty());
		output.putInt(MOOD_KEY, yorkie.needs.mood());
		output.putInt(ENERGY_KEY, yorkie.needs.energy());
		output.putInt(NIGHT_WAKE_TICKS_KEY, yorkie.nightWakeTicks);
		output.putBoolean(HARNESS_KEY, yorkie.hasHarness());
		output.putLong(PEACEFUL_MOB_BARK_MUTED_UNTIL_KEY, yorkie.ownerPresence.peacefulMobBarkMutedUntil());
		output.putLong(LAST_FOOD_BOWL_DAY_KEY, yorkie.domestic.lastFoodBowlDay());
		output.putLong(LAST_WATER_BOWL_DAY_KEY, yorkie.domestic.lastWaterBowlDay());
		output.putLong(LAST_OWNER_CONTACT_GAME_TIME_KEY, yorkie.ownerPresence.lastOwnerContactGameTime());
		output.putLong(LAST_RELIEF_DAY_KEY, yorkie.relief.lastReliefDay());
		output.putString(CALMED_PEACEFUL_MOBS_KEY, yorkie.peacefulMobMemory.save());
		yorkie.trust.save(output);
	}

	static void read(MushroomYorkieEntity yorkie, ValueInput input) {
		yorkie.needs = new PetNeeds(
				input.getIntOr(HUNGER_KEY, PetNeeds.DEFAULT_HUNGER),
				input.getIntOr(POTTY_KEY, PetNeeds.DEFAULT_POTTY),
				input.getIntOr(MOOD_KEY, PetNeeds.DEFAULT_MOOD),
				input.getIntOr(ENERGY_KEY, PetNeeds.DEFAULT_ENERGY)
		);
		yorkie.nightWakeTicks = input.getIntOr(NIGHT_WAKE_TICKS_KEY, 0);
		yorkie.setHarness(input.getBooleanOr(HARNESS_KEY, false));
		yorkie.ownerPresence.setPeacefulMobBarkMutedUntil(input.getLongOr(PEACEFUL_MOB_BARK_MUTED_UNTIL_KEY, -1L));
		yorkie.domestic.setLastFoodBowlDay(input.getLongOr(LAST_FOOD_BOWL_DAY_KEY, DomesticCarePolicy.unloadedDay()));
		yorkie.domestic.setLastWaterBowlDay(input.getLongOr(LAST_WATER_BOWL_DAY_KEY, DomesticCarePolicy.unloadedDay()));
		yorkie.ownerPresence.setLastOwnerContactGameTime(input.getLongOr(LAST_OWNER_CONTACT_GAME_TIME_KEY, 0L));
		yorkie.relief.setLastReliefDay(input.getLongOr(LAST_RELIEF_DAY_KEY, MushroomReliefState.neverRelievedDay()));
		yorkie.peacefulMobMemory.read(input.getStringOr(CALMED_PEACEFUL_MOBS_KEY, ""));
		yorkie.trust.read(input);
	}
}
