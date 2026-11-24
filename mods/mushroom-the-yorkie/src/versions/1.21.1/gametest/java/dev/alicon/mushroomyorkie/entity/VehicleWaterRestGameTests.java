package dev.alicon.mushroomyorkie.entity;

import net.minecraft.gametest.framework.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.world.entity.EntityType;

/** Version-specific registration for water passenger rest controls. */
public final class VehicleWaterRestGameTests {
	/** A breathing swimmer can reach the dry step even with an owner less than two blocks away. */
	@GameTest(template = "mushroom_yorkie_gametest:fetch_arena", timeoutTicks = 160)
	public void shallowShoreNearOwner(GameTestHelper helper) {
		ShallowShoreScenarios.reachDrySupport(helper, EntityType.BOAT, true);
	}

	/** The same wet start still recovers with a farther owner. */
	@GameTest(template = "mushroom_yorkie_gametest:fetch_arena", timeoutTicks = 160)
	public void shallowShoreFarOwner(GameTestHelper helper) {
		ShallowShoreScenarios.reachDrySupport(helper, EntityType.BOAT, false);
	}

	/** A breathing idle input stays exempt even beyond the twenty-tick stall gate. */
	@GameTest(template = "mushroom_yorkie_gametest:fetch_arena", timeoutTicks = 200)
	public void pinnedBreathingIdleDoesNotEscape(GameTestHelper helper) {
		WaterEscapeControllerScenarios.breathingIdleDoesNotEscape(helper);
	}

	/** Explicit oscillating position input cannot keep controller ownership forever. */
	@GameTest(template = "mushroom_yorkie_gametest:fetch_arena", timeoutTicks = 200)
	public void pinnedOscillationReleasesEscape(GameTestHelper helper) {
		WaterEscapeControllerScenarios.episodeReleasesDespiteOscillatingPositions(helper, EntityType.BOAT);
	}

	/** Stalled automatic creative flight can hand control to a physical water escape. */
	@GameTest(template = "mushroom_yorkie_gametest:fetch_arena", timeoutTicks = 450)
	public void farCreativeBoatBankSwimmerEscapes(GameTestHelper helper) {
		BoatBankEscapeScenarios.farCreativeEscapeBank(helper, EntityType.BOAT);
	}
	/** Close grounded creative owners still need a safe escape from boat obstructions. */
	@GameTest(template = "mushroom_yorkie_gametest:fetch_arena", timeoutTicks = 450)
	public void closeCreativeBoatBankSwimmerEscapes(GameTestHelper helper) {
		BoatBankEscapeScenarios.closeCreativeEscapeBank(helper, EntityType.BOAT);
	}

	/** A breathing swimmer keeps normal following beneath a low deck. */
	@GameTest(template = "mushroom_yorkie_gametest:fetch_arena", timeoutTicks = 450)
	public void surfaceSwimmerFollowsUnderDeck(GameTestHelper helper) {
		SurfaceSwimmingScenarios.followUnderDeck(helper);
	}

	/** A swimmer must get around a floating boat to reach its owner's bank. */
	@GameTest(template = "mushroom_yorkie_gametest:fetch_arena", timeoutTicks = 450)
	public void boatBankSwimmerEscapes(GameTestHelper helper) {
		BoatBankEscapeScenarios.escapeBank(helper, EntityType.BOAT);
	}

	/** The same bank remains reachable when no boat blocks the surface. */
	@GameTest(template = "mushroom_yorkie_gametest:fetch_arena", timeoutTicks = 450)
	public void clearBankSwimmerEscapes(GameTestHelper helper) {
		BoatBankEscapeScenarios.escapeBank(helper, null);
	}

	/** Dry floating boat passengers retain their explicit sit order. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 40)
	public void floatingBoatKeepsSit(GameTestHelper helper) {
		VehicleWaterRestScenarios.floatingPassengerKeepsSit(helper, EntityType.BOAT);
	}

	/** Dry floating chest-boat passengers retain their explicit sit order. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 40)
	public void floatingChestBoatKeepsSit(GameTestHelper helper) {
		VehicleWaterRestScenarios.floatingPassengerKeepsSit(helper, EntityType.CHEST_BOAT);
	}

	/** A truly submerged minecart passenger still clears sitting. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 40)
	public void submergedCartRejectsSit(GameTestHelper helper) {
		VehicleWaterRestScenarios.submergedPassengerRejectsSit(helper);
	}

	/** Bubble-column danger still clears rest on a boat. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 40)
	public void bubbleBoatRejectsSit(GameTestHelper helper) {
		VehicleWaterRestScenarios.bubblePassengerRejectsSit(helper, EntityType.BOAT);
	}
	/** A genuinely submerged boat still clears sitting while its passenger is wet. */
	@GameTest(template = "fabric-gametest-api-v1:empty", timeoutTicks = 40)
	public void submergedBoatRejectsSit(GameTestHelper helper) {
		VehicleWaterRestScenarios.submergedBoatRejectsSit(helper, EntityType.BOAT);
	}
}
