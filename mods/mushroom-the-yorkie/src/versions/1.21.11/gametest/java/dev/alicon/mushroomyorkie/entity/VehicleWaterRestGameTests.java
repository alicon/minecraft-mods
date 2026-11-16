package dev.alicon.mushroomyorkie.entity;

import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.world.entity.EntityType;

/** Version-specific registration for water passenger rest controls. */
public final class VehicleWaterRestGameTests {
	/** A swimmer must get around a floating boat to reach its owner's bank. */
	@GameTest(structure = "mushroom_yorkie_gametest:fetch_arena", maxTicks = 200)
	public void boatBankSwimmerEscapes(GameTestHelper helper) {
		BoatBankEscapeScenarios.escapeBank(helper, EntityType.OAK_BOAT);
	}

	/** The same bank remains reachable when no boat blocks the surface. */
	@GameTest(structure = "mushroom_yorkie_gametest:fetch_arena", maxTicks = 200)
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
