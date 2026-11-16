package dev.alicon.mushroomyorkie.entity;

import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.world.entity.EntityType;

/** Version-specific registration for native vehicle boarding regressions. */
public final class VehicleGameTests {
	/** Helping a passenger out cancels movement intended for its old seat. */
	@GameTest
	public void dismountStopsStaleSteering(GameTestHelper helper) {
		VehicleScenarios.dismountStopsStaleSteering(helper, EntityType.OAK_BOAT, EntityType.OAK_CHEST_BOAT, EntityType.MINECART);
	}

	/** Owner dismount grants time to leave before ordinary boarding resumes. */
	@GameTest
	public void ownerDismountBoat(GameTestHelper helper) {
		VehicleScenarios.ownerDismountAllowsTimeToLeave(helper, EntityType.OAK_BOAT);
	}

	/** Creative flight blocks reboarding until the owner lands. */
	@GameTest
	public void flyingOwnerBoat(GameTestHelper helper) {
		VehicleScenarios.flyingOwnerPreventsReboarding(helper, EntityType.OAK_BOAT);
	}

	/** Owner dismount grants time to leave before ordinary boarding resumes. */
	@GameTest
	public void ownerDismountMinecart(GameTestHelper helper) {
		VehicleScenarios.ownerDismountAllowsTimeToLeave(helper, EntityType.MINECART);
	}

	/** Creative flight blocks reboarding until the owner lands. */
	@GameTest
	public void flyingOwnerMinecart(GameTestHelper helper) {
		VehicleScenarios.flyingOwnerPreventsReboarding(helper, EntityType.MINECART);
	}
}
