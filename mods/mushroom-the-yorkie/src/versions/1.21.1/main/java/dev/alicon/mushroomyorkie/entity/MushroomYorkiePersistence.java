package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.pet.PetNeeds;
import net.minecraft.nbt.CompoundTag;

final class MushroomYorkiePersistence {
	private static final String HUNGER_KEY = "Hunger", POTTY_KEY = "Potty", MOOD_KEY = "Mood", ENERGY_KEY = "Energy";
	private static final String NIGHT_WAKE_TICKS_KEY = "NightWakeTicks", HARNESS_KEY = "Harness";
	private static final String PEACEFUL_MOB_BARK_MUTED_UNTIL_KEY = "PeacefulMobBarkMutedUntil";
	private static final String LAST_FOOD_BOWL_DAY_KEY = "LastFoodBowlDay", LAST_WATER_BOWL_DAY_KEY = "LastWaterBowlDay";
	private static final String LAST_OWNER_CONTACT_GAME_TIME_KEY = "LastOwnerContactGameTime";
	private static final String LAST_RELIEF_DAY_KEY = "LastReliefDay", CALMED_PEACEFUL_MOBS_KEY = "CalmedPeacefulMobs";

	private MushroomYorkiePersistence() {
	}

	static void save(MushroomYorkieEntity yorkie, CompoundTag tag) {
		tag.putInt(HUNGER_KEY, yorkie.needs.hunger());
		tag.putInt(POTTY_KEY, yorkie.needs.potty());
		tag.putInt(MOOD_KEY, yorkie.needs.mood());
		tag.putInt(ENERGY_KEY, yorkie.needs.energy());
		tag.putInt(NIGHT_WAKE_TICKS_KEY, yorkie.nightWakeTicks);
		tag.putBoolean(HARNESS_KEY, yorkie.hasHarness());
		tag.putLong(PEACEFUL_MOB_BARK_MUTED_UNTIL_KEY, yorkie.ownerPresence.peacefulMobBarkMutedUntil());
		tag.putLong(LAST_FOOD_BOWL_DAY_KEY, yorkie.domestic.lastFoodBowlDay());
		tag.putLong(LAST_WATER_BOWL_DAY_KEY, yorkie.domestic.lastWaterBowlDay());
		tag.putLong(LAST_OWNER_CONTACT_GAME_TIME_KEY, yorkie.ownerPresence.lastOwnerContactGameTime());
		tag.putLong(LAST_RELIEF_DAY_KEY, yorkie.relief.lastReliefDay());
		tag.putString(CALMED_PEACEFUL_MOBS_KEY, yorkie.peacefulMobMemory.save());
		yorkie.trust.save(tag);
	}

	static void read(MushroomYorkieEntity yorkie, CompoundTag tag) {
		yorkie.needs = new PetNeeds(
				tag.contains(HUNGER_KEY) ? tag.getInt(HUNGER_KEY) : PetNeeds.DEFAULT_HUNGER,
				tag.contains(POTTY_KEY) ? tag.getInt(POTTY_KEY) : PetNeeds.DEFAULT_POTTY,
				tag.contains(MOOD_KEY) ? tag.getInt(MOOD_KEY) : PetNeeds.DEFAULT_MOOD,
				tag.contains(ENERGY_KEY) ? tag.getInt(ENERGY_KEY) : PetNeeds.DEFAULT_ENERGY
		);
		yorkie.nightWakeTicks = tag.contains(NIGHT_WAKE_TICKS_KEY) ? tag.getInt(NIGHT_WAKE_TICKS_KEY) : 0;
		yorkie.setHarness(tag.contains(HARNESS_KEY) && tag.getBoolean(HARNESS_KEY));
		yorkie.ownerPresence.setPeacefulMobBarkMutedUntil(tag.contains(PEACEFUL_MOB_BARK_MUTED_UNTIL_KEY) ? tag.getLong(PEACEFUL_MOB_BARK_MUTED_UNTIL_KEY) : -1L);
		yorkie.domestic.setLastFoodBowlDay(tag.contains(LAST_FOOD_BOWL_DAY_KEY) ? tag.getLong(LAST_FOOD_BOWL_DAY_KEY) : DomesticCarePolicy.unloadedDay());
		yorkie.domestic.setLastWaterBowlDay(tag.contains(LAST_WATER_BOWL_DAY_KEY) ? tag.getLong(LAST_WATER_BOWL_DAY_KEY) : DomesticCarePolicy.unloadedDay());
		yorkie.ownerPresence.setLastOwnerContactGameTime(tag.contains(LAST_OWNER_CONTACT_GAME_TIME_KEY) ? tag.getLong(LAST_OWNER_CONTACT_GAME_TIME_KEY) : 0L);
		yorkie.relief.setLastReliefDay(tag.contains(LAST_RELIEF_DAY_KEY) ? tag.getLong(LAST_RELIEF_DAY_KEY) : MushroomReliefState.neverRelievedDay());
		yorkie.peacefulMobMemory.read(tag.contains(CALMED_PEACEFUL_MOBS_KEY) ? tag.getString(CALMED_PEACEFUL_MOBS_KEY) : "");
		yorkie.trust.read(tag);
	}
}
