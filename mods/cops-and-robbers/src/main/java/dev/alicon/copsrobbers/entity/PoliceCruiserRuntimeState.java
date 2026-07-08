package dev.alicon.copsrobbers.entity;

import net.minecraft.world.entity.player.Player;

final class PoliceCruiserRuntimeState {
	private PoliceCruiserRuntimeState() {
	}

	static void refreshServerState(PoliceCruiserEntity cruiser) {
		if (!(cruiser.getControllingPassenger() instanceof Player driver) || !driver.isCreative()) {
			cruiser.creativeFlightEnabled = false;
			cruiser.creativeFlightLiftInput = 0.0F;
			cruiser.setNoGravity(false);
		}
		if (!(cruiser.getControllingPassenger() instanceof Player)) {
			cruiser.forwardInput = 0.0F;
		}
		if (cruiser.crashCooldownTicks > 0) {
			cruiser.crashCooldownTicks--;
		}
	}
}
