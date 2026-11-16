package dev.alicon.mushroomyorkie.entity;

import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.world.entity.EntityType;

/** Version-specific registration for water passenger rest controls. */
public final class VehicleWaterRestGameTests {
	/** A breathing idle input stays exempt even beyond the twenty-tick stall gate. */
	@GameTest(structure = "mushroom_yorkie_gametest:fetch_arena", maxTicks = 200)
	public void pinnedBreathingIdleDoesNotEscape(GameTestHelper helper) {
		WaterEscapeControllerScenarios.breathingIdleDoesNotEscape(helper);
	}

	/** Explicit oscillating position input cannot keep controller ownership forever. */
	@GameTest(structure = "mushroom_yorkie_gametest:fetch_arena", maxTicks = 200)
	public void pinnedOscillationReleasesEscape(GameTestHelper helper) {
		WaterEscapeControllerScenarios.episodeReleasesDespiteOscillatingPositions(helper, EntityType.OAK_BOAT);
	}

	/** Stalled automatic creative flight can hand control to a physical water escape. */
	@GameTest(structure = "mushroom_yorkie_gametest:fetch_arena", maxTicks = 450)
	public void farCreativeBoatBankSwimmerEscapes(GameTestHelper helper) {
		BoatBankEscapeScenarios.farCreativeEscapeBank(helper, EntityType.OAK_BOAT);
	}
	/** Close grounded creative owners still need a safe escape from boat obstructions. */
	@GameTest(structure = "mushroom_yorkie_gametest:fetch_arena", maxTicks = 450)
	public void closeCreativeBoatBankSwimmerEscapes(GameTestHelper helper) {
		BoatBankEscapeScenarios.closeCreativeEscapeBank(helper, EntityType.OAK_BOAT);
	}

	/** A breathing swimmer keeps normal following beneath a low deck. */
	@GameTest(structure = "mushroom_yorkie_gametest:fetch_arena", maxTicks = 450)
	public void surfaceSwimmerFollowsUnderDeck(GameTestHelper helper) {
		SurfaceSwimmingScenarios.followUnderDeck(helper);
	}

	/** A swimmer must get around a floating boat to reach its owner's bank. */
	@GameTest(structure = "mushroom_yorkie_gametest:fetch_arena", maxTicks = 450)
	public void boatBankSwimmerEscapes(GameTestHelper helper) {
		BoatBankEscapeScenarios.escapeBank(helper, EntityType.OAK_BOAT);
	}

	/** The same bank remains reachable when no boat blocks the surface. */
	@GameTest(structure = "mushroom_yorkie_gametest:fetch_arena", maxTicks = 450)
	public void clearBankSwimmerEscapes(GameTestHelper helper) {
		BoatBankEscapeScenarios.escapeBank(helper, null);
	}

	/** Dry floating boat passengers retain their explicit sit order. */
	@GameTest(maxTicks = 40)
	public void floatingBoatKeepsSit(GameTestHelper helper) {
		VehicleWaterRestScenarios.floatingPassengerKeepsSit(helper, EntityType.OAK_BOAT);
	}

	/** Dry floating chest-boat passengers retain their explicit sit order. */
	@GameTest(maxTicks = 40)
	public void floatingChestBoatKeepsSit(GameTestHelper helper) {
		VehicleWaterRestScenarios.floatingPassengerKeepsSit(helper, EntityType.OAK_CHEST_BOAT);
	}

	/** A truly submerged minecart passenger still clears sitting. */
	@GameTest(maxTicks = 40)
	public void submergedCartRejectsSit(GameTestHelper helper) {
		VehicleWaterRestScenarios.submergedPassengerRejectsSit(helper);
	}

	/** Bubble-column danger still clears rest on a boat. */
	@GameTest(maxTicks = 40)
	public void bubbleBoatRejectsSit(GameTestHelper helper) {
		VehicleWaterRestScenarios.bubblePassengerRejectsSit(helper, EntityType.OAK_BOAT);
	}
	/** A genuinely submerged boat still clears sitting while its passenger is wet. */
	@GameTest(maxTicks = 40)
	public void submergedBoatRejectsSit(GameTestHelper helper) {
		VehicleWaterRestScenarios.submergedBoatRejectsSit(helper, EntityType.OAK_BOAT);
	}
}
