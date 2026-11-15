package dev.alicon.mushroomyorkie.entity;

import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.util.ProblemReporter;
import net.minecraft.world.level.storage.TagValueInput;
import net.minecraft.world.level.storage.TagValueOutput;
import net.minecraft.gametest.framework.GameTestHelper;

/** Native serialization adapters for the shared carried-toy lifecycle regressions. */
public final class FetchPersistenceGameTests {
	/** Preserve a named toy and return one copy after reload. */
	@GameTest
	public void fetchedToySurvivesSaveAndReturns(GameTestHelper helper) {
		FetchPersistenceScenarios.fetchedToySurvivesSaveAndReturns(helper, yorkie -> roundTrip(helper, yorkie));
	}

	/** Preserve exactly one toy through repeated post-load interruptions. */
	@GameTest
	public void stoppedReloadedFetchDoesNotDuplicate(GameTestHelper helper) {
		FetchPersistenceScenarios.stoppedReloadedFetchDoesNotDuplicate(helper, yorkie -> roundTrip(helper, yorkie));
	}

	/** Return a complete valid stored stack. */
	@GameTest
	public void resumedFetchReturnsWholeStoredStack(GameTestHelper helper) {
		FetchPersistenceScenarios.resumedFetchReturnsWholeStoredStack(helper, yorkie -> roundTrip(helper, yorkie));
	}

	/** Drop the saved possession on environmental death without duplicating it. */
	@GameTest
	public void carriedToyDropsOnEnvironmentalDeath(GameTestHelper helper) {
		FetchPersistenceScenarios.carriedToyDropsOnEnvironmentalDeath(helper, yorkie -> roundTrip(helper, yorkie),
				yorkie -> helper.hurt(yorkie, helper.getLevel().damageSources().generic(), 100.0F));
	}

	private static MushroomYorkieEntity roundTrip(GameTestHelper helper, MushroomYorkieEntity yorkie) {
		TagValueOutput output = TagValueOutput.createWithContext(ProblemReporter.DISCARDING, helper.getLevel().registryAccess());
		yorkie.saveWithoutId(output);
		var data = output.buildResult();
		yorkie.discard();
		MushroomYorkieEntity restored = new MushroomYorkieEntity(ModEntities.MUSHROOM_YORKIE, helper.getLevel());
		restored.load(TagValueInput.create(ProblemReporter.DISCARDING, helper.getLevel().registryAccess(), data));
		helper.getLevel().addFreshEntity(restored);
		return restored;
	}
}
