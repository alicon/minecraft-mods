package dev.alicon.narwhaltogether;

import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;

final class PlayerTeleporter {
	private static final long COOLDOWN_TICKS = 40;
	private static final Map<UUID, Long> LAST_TELEPORT_TICK = new HashMap<>();
	private static final Map<UUID, UUID> LAST_TARGET = new HashMap<>();

	private PlayerTeleporter() {
	}

	static void teleportToNextPlayer(ServerPlayer player) {
		long currentTick = player.level().getGameTime();
		long lastTick = LAST_TELEPORT_TICK.getOrDefault(player.getUUID(), Long.MIN_VALUE / 2);

		if (currentTick - lastTick < COOLDOWN_TICKS) {
			player.displayClientMessage(Component.translatable("message.narwhal_together.teleport_cooldown"), true);
			return;
		}

		List<ServerPlayer> targets = player.level().getServer().getPlayerList().getPlayers().stream()
				.filter(candidate -> candidate != player)
				.filter(candidate -> !candidate.isSpectator())
				.sorted(Comparator.comparing(candidate -> candidate.getName().getString(), String.CASE_INSENSITIVE_ORDER))
				.toList();

		if (targets.isEmpty()) {
			player.displayClientMessage(Component.translatable("message.narwhal_together.no_players"), true);
			return;
		}

		ServerPlayer target = nextTarget(player, targets);
		player.stopRiding();
		NarwhalMinecraft.teleport(player, target);
		player.resetFallDistance();

		LAST_TELEPORT_TICK.put(player.getUUID(), currentTick);
		LAST_TARGET.put(player.getUUID(), target.getUUID());
		player.displayClientMessage(
				Component.translatable("message.narwhal_together.teleported", target.getDisplayName()),
				true
		);
		target.displayClientMessage(
				Component.translatable("message.narwhal_together.arrived", player.getDisplayName()),
				true
		);
	}

	private static ServerPlayer nextTarget(ServerPlayer player, List<ServerPlayer> targets) {
		UUID lastTarget = LAST_TARGET.get(player.getUUID());
		return TeleportTargetSelector.nextTarget(lastTarget, targets, ServerPlayer::getUUID);
	}
}
