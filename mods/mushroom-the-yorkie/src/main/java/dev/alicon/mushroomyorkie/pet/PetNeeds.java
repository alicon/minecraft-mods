package dev.alicon.mushroomyorkie.pet;

/** Mutable, clamped pet-needs state for Mushroom gameplay rules that do not require Minecraft APIs. */
public final class PetNeeds {
	/** Lowest allowed value for every need meter. */
	public static final int MIN_VALUE = 0;
	/** Highest allowed value for every need meter. */
	public static final int MAX_VALUE = 100;
	/** Default hunger for a newly created Mushroom. */
	public static final int DEFAULT_HUNGER = 0;
	/** Default potty need for a newly created Mushroom. */
	public static final int DEFAULT_POTTY = 0;
	/** Default mood for a newly created Mushroom. */
	public static final int DEFAULT_MOOD = 80;
	/** Default energy for a newly created Mushroom. */
	public static final int DEFAULT_ENERGY = 80;
	/** Potty value above which Mushroom should start warning the owner. */
	public static final int POTTY_WARNING_THRESHOLD = 80;

	private int hunger;
	private int potty;
	private int mood;
	private int energy;

	/** Creates healthy default needs for a newly spawned or freshly initialized Mushroom. */
	public PetNeeds() {
		this(DEFAULT_HUNGER, DEFAULT_POTTY, DEFAULT_MOOD, DEFAULT_ENERGY);
	}

	/**
	 * Creates needs from loaded or test-supplied values, clamping every value to the supported range.
	 *
	 * @param hunger current hunger level
	 * @param potty current potty need
	 * @param mood current mood level
	 * @param energy current energy level
	 */
	public PetNeeds(int hunger, int potty, int mood, int energy) {
		this.hunger = clamp(hunger);
		this.potty = clamp(potty);
		this.mood = clamp(mood);
		this.energy = clamp(energy);
	}

	/** Applies the gameplay effects of giving Mushroom a Yorkie treat. */
	public void feedTreat() {
		this.adjust(-35, 20, 18, 8);
	}

	/** Applies one proper bowl meal. */
	public void eatMeal() {
		this.adjust(-65, 25, 10, 6);
	}

	/** Applies one normal player food item. */
	public void eatPlayerFood(int nutrition) {
		int foodValue = Math.max(1, nutrition);
		this.adjust(-Math.max(8, foodValue * 8), Math.max(2, foodValue * 2), 6, Math.min(8, foodValue));
	}

	/** Applies one drink from a water bowl. */
	public void drinkWater() {
		this.adjust(0, 8, 4, 0);
	}

	/** Applies a short play interaction with a toy. */
	public void playWithToy() {
		this.adjust(0, 0, 14, -4);
	}

	/**
	 * Advances slow-changing needs by one server-side needs interval.
	 *
	 * @param outside whether Mushroom currently has sky access
	 * @param sitting whether Mushroom is ordered to sit
	 */
	public void tickNeeds(boolean outside, boolean sitting) {
		this.tickNeeds(outside, sitting, true);
	}

	/**
	 * Advances slow-changing needs by one server-side needs interval.
	 *
	 * @param outside whether Mushroom currently has sky access
	 * @param sitting whether Mushroom is ordered to sit
	 * @param spendHunger whether this interval should drain his food bar
	 */
	public void tickNeeds(boolean outside, boolean sitting, boolean spendHunger) {
		if (spendHunger) {
			this.hunger = clamp(this.hunger + 1);
		}
		this.potty = clamp(this.potty + (this.hunger > 65 ? 2 : 1));
		this.energy = clamp(this.energy - (sitting ? 0 : 1));

		if (outside) {
			this.potty = clamp(this.potty - 8);
			this.mood = clamp(this.mood + 1);
		} else if (this.potty > POTTY_WARNING_THRESHOLD) {
			this.mood = clamp(this.mood - 2);
		}
	}

	/** Resets potty need after Mushroom has spent a few seconds outside. */
	public void relieveOutside() {
		this.potty = MIN_VALUE;
		this.mood = clamp(this.mood + 4);
	}

	/**
	 * Reports whether potty need is high enough to warn the owner.
	 *
	 * @return true when Mushroom should make a warning sound or behavior
	 */
	public boolean shouldWarnPotty() {
		return this.potty > POTTY_WARNING_THRESHOLD;
	}

	/** Reports whether Mushroom's food bar is empty enough to take starvation damage. */
	public boolean isStarving() {
		return this.hunger >= MAX_VALUE;
	}

	/** Current visible food pips, matching a ten-slot Minecraft-style food bar. */
	public int foodPips() {
		return clamp((MAX_VALUE - this.hunger + 9) / 10, 0, 10);
	}

	/** Simple ASCII food bar for chat/actionbar messages. */
	public String foodBar() {
		int pips = this.foodPips();
		return "[" + "#".repeat(pips) + ".".repeat(10 - pips) + "] " + pips + "/10";
	}

	/**
	 * Current hunger level.
	 *
	 * @return clamped hunger value from 0 to 100
	 */
	public int hunger() {
		return this.hunger;
	}

	/**
	 * Current potty need.
	 *
	 * @return clamped potty value from 0 to 100
	 */
	public int potty() {
		return this.potty;
	}

	/**
	 * Current mood level.
	 *
	 * @return clamped mood value from 0 to 100
	 */
	public int mood() {
		return this.mood;
	}

	/**
	 * Current energy level.
	 *
	 * @return clamped energy value from 0 to 100
	 */
	public int energy() {
		return this.energy;
	}

	private static int clamp(int value) {
		return Math.max(MIN_VALUE, Math.min(MAX_VALUE, value));
	}

	private static int clamp(int value, int min, int max) {
		return Math.max(min, Math.min(max, value));
	}

	private void adjust(int hungerDelta, int pottyDelta, int moodDelta, int energyDelta) {
		this.hunger = clamp(this.hunger + hungerDelta);
		this.potty = clamp(this.potty + pottyDelta);
		this.mood = clamp(this.mood + moodDelta);
		this.energy = clamp(this.energy + energyDelta);
	}
}
