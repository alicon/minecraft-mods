package dev.alicon.mushroomyorkie.entity;

import net.minecraft.gametest.framework.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.world.entity.EntityType;

/** Version-specific registration for native vehicle boarding regressions. */
public final class VehicleGameTests {
	/** Helping a passenger out cancels movement intended for its old seat. */
	@GameTest(template = "fabric-gametest-api-v1:empty")
	public void dismountStopsStaleSteering(GameTestHelper helper) {
		VehicleScenarios.dismountStopsStaleSteering(helper, EntityType.BOAT, EntityType.CHEST_BOAT, EntityType.MINECART);
	}

	/** Owner dismount grants time to leave before ordinary boarding resumes. */
	@GameTest(template = "fabric-gametest-api-v1:empty")
	public void ownerDismountBoat(GameTestHelper helper) {
		VehicleScenarios.ownerDismountAllowsTimeToLeave(helper, EntityType.BOAT);
	}

	/** Creative flight blocks reboarding until the owner lands. */
	@GameTest(template = "fabric-gametest-api-v1:empty")
	public void flyingOwnerBoat(GameTestHelper helper) {
		VehicleScenarios.flyingOwnerPreventsReboarding(helper, EntityType.BOAT);
	}

	/** Owner dismount grants time to leave before ordinary boarding resumes. */
	@GameTest(template = "fabric-gametest-api-v1:empty")
	public void ownerDismountMinecart(GameTestHelper helper) {
		VehicleScenarios.ownerDismountAllowsTimeToLeave(helper, EntityType.MINECART);
	}

	/** Creative flight blocks reboarding until the owner lands. */
	@GameTest(template = "fabric-gametest-api-v1:empty")
	public void flyingOwnerMinecart(GameTestHelper helper) {
		VehicleScenarios.flyingOwnerPreventsReboarding(helper, EntityType.MINECART);
	}
}
