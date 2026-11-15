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

	/** Return a consumed possession even if the owner becomes creative. */
	@GameTest
	public void realToySurvivesOwnerBecomingCreative(GameTestHelper helper) {
		FetchModeChangeScenarios.realToySurvivesOwnerBecomingCreative(helper, yorkie -> roundTrip(helper, yorkie));
	}

	/** Do not return an extra free throw copy when its owner becomes survival. */
	@GameTest
	public void creativeCopyDoesNotDuplicateAfterSurvivalSwitch(GameTestHelper helper) {
		FetchModeChangeScenarios.creativeCopyDoesNotDuplicateAfterSurvivalSwitch(helper, yorkie -> roundTrip(helper, yorkie));
	}

	/** Do not turn an interrupted free throw into a second physical toy. */
	@GameTest
	public void creativeCopyDoesNotDuplicateOnInterruption(GameTestHelper helper) {
		FetchModeChangeScenarios.creativeCopyDoesNotDuplicateOnInterruption(helper, yorkie -> roundTrip(helper, yorkie));
	}

	/** Do not drop an extra free throw copy on death. */
	@GameTest
	public void creativeCopyDoesNotDuplicateOnDeath(GameTestHelper helper) {
		FetchModeChangeScenarios.creativeCopyDoesNotDuplicateOnDeath(helper, yorkie -> roundTrip(helper, yorkie),
				yorkie -> helper.hurt(yorkie, helper.getLevel().damageSources().generic(), 100.0F));
	}

	/** A physical survival rethrow must return the inventory item it consumed. */
	@GameTest
	public void survivalRethrowReturnsAnInheritedCopy(GameTestHelper helper) {
		FetchModeChangeScenarios.survivalRethrowReturnsAnInheritedCopy(helper, yorkie -> roundTrip(helper, yorkie));
	}

	/** A free throw is never a second collectible inventory item, including after mode changes. */
	@GameTest
	public void creativeCopyCannotBeCollectedAsInventory(GameTestHelper helper) {
		FetchModeChangeScenarios.creativeCopyCannotBeCollectedAsInventory(helper);
	}

	/** Keep overflow across interruption and reload, then return it when creative inventory has room. */
	@GameTest
	public void realToySurvivesFullCreativeInventory(GameTestHelper helper) {
		FetchModeChangeScenarios.realToySurvivesFullCreativeInventory(helper, yorkie -> roundTrip(helper, yorkie));
	}

	/** Keep overflow across interruption and reload, then return it when creative inventory has room. */
	@GameTest
	public void realToySurvivesPartialCreativeInventory(GameTestHelper helper) {
		FetchModeChangeScenarios.realToySurvivesPartialCreativeInventory(helper, yorkie -> roundTrip(helper, yorkie));
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
