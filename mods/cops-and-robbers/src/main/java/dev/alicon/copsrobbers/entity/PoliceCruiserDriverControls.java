package dev.alicon.copsrobbers.entity;

import dev.alicon.copsrobbers.CopsAndRobbers;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;

final class PoliceCruiserDriverControls {
	private PoliceCruiserDriverControls() {
	}

	static void toggleLights(ServerPlayer player) {
		if (player.getVehicle() instanceof PoliceCruiserEntity cruiser && cruiser.getControllingPassenger() == player) {
			boolean enabled = !cruiser.lightsEnabled();
			cruiser.setLightsEnabled(enabled);
			player.displayClientMessage(Component.literal(enabled ? "Cruiser lights on" : "Cruiser lights off"), true);
			cruiser.level().playSound(null, cruiser.blockPosition(), SoundEvents.LEVER_CLICK, SoundSource.PLAYERS, 0.8F, enabled ? 1.4F : 0.8F);
		}
	}

	static void toggleSiren(ServerPlayer player) {
		if (player.getVehicle() instanceof PoliceCruiserEntity cruiser && cruiser.getControllingPassenger() == player) {
			boolean enabled = !cruiser.sirenEnabled();
			cruiser.setSirenEnabled(enabled);
			player.displayClientMessage(Component.literal(enabled ? "Cruiser siren on" : "Cruiser siren off"), true);
			cruiser.level().playSound(null, cruiser.blockPosition(), SoundEvents.NOTE_BLOCK_BELL.value(), SoundSource.PLAYERS, 1.1F, enabled ? 1.8F : 0.7F);
		}
	}

	static void toggleFlight(ServerPlayer player) {
		if (player.isCreative() && player.getVehicle() instanceof PoliceCruiserEntity cruiser && cruiser.getControllingPassenger() == player) {
			cruiser.creativeFlightEnabled = !cruiser.creativeFlightEnabled;
			if (!cruiser.creativeFlightEnabled) {
				cruiser.setNoGravity(false);
				cruiser.creativeFlightLiftInput = 0.0F;
			}
			player.displayClientMessage(Component.literal(cruiser.creativeFlightEnabled ? "Cruiser flight enabled" : "Cruiser flight disabled"), true);
		}
	}

	static void updateFlightInput(ServerPlayer player, float lift) {
		if (player.isCreative() && player.getVehicle() instanceof PoliceCruiserEntity cruiser && cruiser.getControllingPassenger() == player) {
			float safeLift = PoliceCruiserControlPolicy.liftInput(lift);
			if (safeLift != lift) {
				CopsAndRobbers.LOGGER.debug("Sanitized cruiser flight lift from {} to {} for {}", lift, safeLift, player.getName().getString());
			}
			cruiser.creativeFlightLiftInput = safeLift;
		}
	}

	static void triggerBarrelRoll(ServerPlayer player) {
		if (player.isCreative() && player.getVehicle() instanceof PoliceCruiserEntity cruiser && cruiser.getControllingPassenger() == player) {
			cruiser.startTrick(PoliceCruiserEntity.TRICK_BARREL_ROLL);
		}
	}

	static void triggerLoop(ServerPlayer player) {
		if (player.isCreative() && player.getVehicle() instanceof PoliceCruiserEntity cruiser && cruiser.getControllingPassenger() == player) {
			cruiser.startTrick(PoliceCruiserEntity.TRICK_LOOP);
		}
	}
}
