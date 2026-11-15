package dev.alicon.mushroomyorkie.entity;

import net.minecraft.gametest.framework.GameTest;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.gametest.framework.GameTestHelper;

/** Native serialization adapters for the shared carried-toy lifecycle regressions. */
public final class FetchPersistenceGameTests {
	/** Preserve a named toy and return one copy after reload. */
	@GameTest(template = "fabric-gametest-api-v1:empty")
	public void fetchedToySurvivesSaveAndReturns(GameTestHelper helper) {
		FetchPersistenceScenarios.fetchedToySurvivesSaveAndReturns(helper, yorkie -> roundTrip(helper, yorkie));
	}

	/** Preserve exactly one toy through repeated post-load interruptions. */
	@GameTest(template = "fabric-gametest-api-v1:empty")
	public void stoppedReloadedFetchDoesNotDuplicate(GameTestHelper helper) {
		FetchPersistenceScenarios.stoppedReloadedFetchDoesNotDuplicate(helper, yorkie -> roundTrip(helper, yorkie));
	}

	/** Return a complete valid stored stack. */
	@GameTest(template = "fabric-gametest-api-v1:empty")
	public void resumedFetchReturnsWholeStoredStack(GameTestHelper helper) {
		FetchPersistenceScenarios.resumedFetchReturnsWholeStoredStack(helper, yorkie -> roundTrip(helper, yorkie));
	}

	/** Drop the saved possession on environmental death without duplicating it. */
	@GameTest(template = "fabric-gametest-api-v1:empty")
	public void carriedToyDropsOnEnvironmentalDeath(GameTestHelper helper) {
		FetchPersistenceScenarios.carriedToyDropsOnEnvironmentalDeath(helper, yorkie -> roundTrip(helper, yorkie),
				yorkie -> yorkie.hurt(helper.getLevel().damageSources().generic(), 100.0F));
	}

	private static MushroomYorkieEntity roundTrip(GameTestHelper helper, MushroomYorkieEntity yorkie) {
		CompoundTag data = yorkie.saveWithoutId(new CompoundTag());
		yorkie.discard();
		MushroomYorkieEntity restored = new MushroomYorkieEntity(ModEntities.MUSHROOM_YORKIE, helper.getLevel());
		restored.load(data);
		helper.getLevel().addFreshEntity(restored);
		return restored;
	}
}
