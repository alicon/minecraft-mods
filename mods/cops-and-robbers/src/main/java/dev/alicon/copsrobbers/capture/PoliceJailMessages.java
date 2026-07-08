package dev.alicon.copsrobbers.capture;

import dev.alicon.copsrobbers.entity.PoliceCruiserEntity;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.player.Player;

final class PoliceJailMessages {
	private PoliceJailMessages() {
	}

	static void showDriverMessage(PoliceCruiserEntity cruiser, Component message) {
		if (cruiser.getControllingPassenger() instanceof Player driver) {
			driver.displayClientMessage(message, true);
		}
	}

	static void alertNearbyPlayers(ServerLevel level, BlockPos center, Component message) {
		for (Player player : level.players()) {
			if (player.distanceToSqr(center.getCenter()) <= 96.0D * 96.0D) {
				player.displayClientMessage(message, true);
			}
		}
	}
}
