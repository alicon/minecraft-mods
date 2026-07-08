package dev.alicon.copsrobbers.entity;

import net.minecraft.world.entity.player.Player;
import net.minecraft.world.phys.Vec3;

final class PoliceCruiserTravelController {
	private PoliceCruiserTravelController() {
	}

	static boolean travelWithDriver(PoliceCruiserEntity cruiser, Vec3 travelVector) {
		if (!cruiser.isAlive() || !cruiser.isVehicle() || !(cruiser.getControllingPassenger() instanceof Player driver)) {
			return false;
		}

		alignToDriver(cruiser, driver);
		if (driver.isCreative() && cruiser.creativeFlightEnabled) {
			cruiser.setNoGravity(true);
			cruiser.forwardInput = PoliceCruiserControlPolicy.forwardInput(driver.zza);
			return true;
		}

		cruiser.setNoGravity(false);
		cruiser.travelGround(driver, travelVector);
		return true;
	}

	private static void alignToDriver(PoliceCruiserEntity cruiser, Player driver) {
		cruiser.setYRot(driver.getYRot());
		cruiser.yRotO = cruiser.getYRot();
		cruiser.setXRot(0.0F);
		cruiser.setYHeadRot(cruiser.getYRot());
		cruiser.yBodyRot = cruiser.getYRot();
	}
}
