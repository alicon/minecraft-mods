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

	/** Return a consumed possession even if the owner becomes creative. */
	@GameTest(template = "fabric-gametest-api-v1:empty")
	public void realToySurvivesOwnerBecomingCreative(GameTestHelper helper) {
		FetchModeChangeScenarios.realToySurvivesOwnerBecomingCreative(helper, yorkie -> roundTrip(helper, yorkie));
	}

	/** Do not return an extra free throw copy when its owner becomes survival. */
	@GameTest(template = "fabric-gametest-api-v1:empty")
	public void creativeCopyDoesNotDuplicateAfterSurvivalSwitch(GameTestHelper helper) {
		FetchModeChangeScenarios.creativeCopyDoesNotDuplicateAfterSurvivalSwitch(helper, yorkie -> roundTrip(helper, yorkie));
	}

	/** Do not turn an interrupted free throw into a second physical toy. */
	@GameTest(template = "fabric-gametest-api-v1:empty")
	public void creativeCopyDoesNotDuplicateOnInterruption(GameTestHelper helper) {
		FetchModeChangeScenarios.creativeCopyDoesNotDuplicateOnInterruption(helper, yorkie -> roundTrip(helper, yorkie));
	}

	/** Do not drop an extra free throw copy on death. */
	@GameTest(template = "fabric-gametest-api-v1:empty")
	public void creativeCopyDoesNotDuplicateOnDeath(GameTestHelper helper) {
		FetchModeChangeScenarios.creativeCopyDoesNotDuplicateOnDeath(helper, yorkie -> roundTrip(helper, yorkie),
				yorkie -> yorkie.hurt(helper.getLevel().damageSources().generic(), 100.0F));
	}

	/** A physical survival rethrow must return the inventory item it consumed. */
	@GameTest(template = "fabric-gametest-api-v1:empty")
	public void survivalRethrowReturnsAnInheritedCopy(GameTestHelper helper) {
		FetchModeChangeScenarios.survivalRethrowReturnsAnInheritedCopy(helper, yorkie -> roundTrip(helper, yorkie));
	}

	/** A free throw is never a second collectible inventory item, including after mode changes. */
	@GameTest(template = "fabric-gametest-api-v1:empty")
	public void creativeCopyCannotBeCollectedAsInventory(GameTestHelper helper) {
		FetchModeChangeScenarios.creativeCopyCannotBeCollectedAsInventory(helper);
	}

	/** Keep overflow across interruption and reload, then return it when creative inventory has room. */
	@GameTest(template = "fabric-gametest-api-v1:empty")
	public void realToySurvivesFullCreativeInventory(GameTestHelper helper) {
		FetchModeChangeScenarios.realToySurvivesFullCreativeInventory(helper, yorkie -> roundTrip(helper, yorkie));
	}

	/** Keep overflow across interruption and reload, then return it when creative inventory has room. */
	@GameTest(template = "fabric-gametest-api-v1:empty")
	public void realToySurvivesPartialCreativeInventory(GameTestHelper helper) {
		FetchModeChangeScenarios.realToySurvivesPartialCreativeInventory(helper, yorkie -> roundTrip(helper, yorkie));
	}

	/** Resume safe ascent after saving a carried toy with its creative owner already landed. */
	@GameTest(template = "mushroom_yorkie_gametest:fetch_arena")
	public void airborneReturnSurvivesSavedLanding(GameTestHelper helper) {
		FetchFlightScenarios.airborneReturnSurvivesReload(helper, yorkie -> roundTrip(helper, yorkie), true);
	}

	/** Preserve safe return when the owner remains in flight across the same save/load. */
	@GameTest(template = "mushroom_yorkie_gametest:fetch_arena")
	public void airborneReturnSurvivesFlyingReload(GameTestHelper helper) {
		FetchFlightScenarios.airborneReturnSurvivesReload(helper, yorkie -> roundTrip(helper, yorkie), false);
	}

	/** Reopen damaged and worn-out expedition armor with the original dog and owner. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 20)
	public void expeditionVestSurvivesReload(GameTestHelper helper) {
		ExpeditionVestScenarios.armor(helper, dog -> roundTrip(helper, dog),
				(dog, damage) -> dog.hurt(damage, 4.0F));
	}

	/** A dog can take cover, persist the owner's camp, and wait for recall if the mat disappears. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 180)
	public void expeditionCampSurvivesReload(GameTestHelper helper) {
		ExpeditionCampScenarios.retreatAndRecall(helper, dog -> roundTrip(helper, dog));
	}

	/** A following dog pauses when both sides of a narrow bridge drop away. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 180)
	public void expeditionCrossesAfterWideningBridge(GameTestHelper helper) {
		ExpeditionCampScenarios.narrowCrossing(helper);
	}

	/** Warning at an unsafe crossing preserves a guest's lead and the dog's owner. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 100)
	public void expeditionWarnsWhileGuestHoldsLead(GameTestHelper helper) {
		ExpeditionCampScenarios.borrowedLeadCrossing(helper);
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
