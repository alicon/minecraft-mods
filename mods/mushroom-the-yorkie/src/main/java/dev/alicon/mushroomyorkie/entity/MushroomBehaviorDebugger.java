package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.MushroomTheYorkie;
import java.util.HashMap;
import java.util.Map;
import java.util.WeakHashMap;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;

final class MushroomBehaviorDebugger {
	private static final int MESSAGE_TICKS = 160;
	private static final int IMMEDIATE_MESSAGE_TICKS = 80;
	private static final int BASELINE_TICKS = 400;
	private static final int WRAP_CHARS = 72;
	private static final Map<MushroomYorkieEntity, Map<String, Integer>> NEXT_MESSAGE_TICKS = new WeakHashMap<>();

	private MushroomBehaviorDebugger() {
	}

	static void debug(MushroomYorkieEntity yorkie, String state, String detail, boolean immediate) {
		if (!MushroomTheYorkie.debugMessages()) {
			return;
		}

		Player player = debugPlayer(yorkie);
		if (player == null || !shouldSend(yorkie, state, immediate)) {
			return;
		}

		sendWrapped(player, "Mushroom debug: " + detail);
		MushroomTheYorkie.LOGGER.info(
				"Mushroom behavior debug: state={} detail={} player={} distanceToPlayer={} pos={} tame={} sitting={} sleeping={} scaredTicks={} needs={}/{}/{}/{}",
				state,
				detail,
				player.getName().getString(),
				Math.sqrt(yorkie.distanceToSqr(player)),
				yorkie.blockPosition(),
				yorkie.isTame(),
				yorkie.isOrderedToSit(),
				yorkie.isMushroomSleeping(),
				yorkie.scaredRunTicks,
				yorkie.needs.hunger(),
				yorkie.needs.potty(),
				yorkie.needs.mood(),
				yorkie.needs.energy()
		);
	}

	static void baseline(MushroomYorkieEntity yorkie, ServerLevel level) {
		if (yorkie.tickCount % BASELINE_TICKS != 0) {
			return;
		}

		String detail = "baseline: tame=" + yorkie.isTame()
				+ ", sitting=" + yorkie.isOrderedToSit()
				+ ", sleeping=" + yorkie.isMushroomSleeping()
				+ ", flyingOwner=" + yorkie.ownerIsCreativeFlying()
				+ ", needsOutside=" + yorkie.shouldAskToGoOutside(level);
		debug(yorkie, "baseline", detail, false);
	}

	private static boolean shouldSend(MushroomYorkieEntity yorkie, String state, boolean immediate) {
		Map<String, Integer> ticksByState = NEXT_MESSAGE_TICKS.computeIfAbsent(yorkie, ignored -> new HashMap<>());
		int nextTick = ticksByState.getOrDefault(state, Integer.MIN_VALUE);
		if (!immediate && yorkie.tickCount < nextTick) {
			return false;
		}

		ticksByState.put(state, yorkie.tickCount + (immediate ? IMMEDIATE_MESSAGE_TICKS : MESSAGE_TICKS));
		return true;
	}

	private static void sendWrapped(Player player, String text) {
		for (String line : wrappedLines(text)) {
			player.displayClientMessage(Component.literal(line), false);
		}
	}

	private static java.util.List<String> wrappedLines(String text) {
		java.util.List<String> lines = new java.util.ArrayList<>();
		if (text.length() <= WRAP_CHARS) {
			lines.add(text);
			return lines;
		}

		StringBuilder line = new StringBuilder(WRAP_CHARS);
		int lineLength = 0;
		for (String word : text.split(" ")) {
			if (lineLength > 0 && lineLength + 1 + word.length() > WRAP_CHARS) {
				lines.add(line.toString());
				line.setLength(0);
				lineLength = 0;
			} else if (lineLength > 0) {
				line.append(' ');
				lineLength++;
			}
			line.append(word);
			lineLength += word.length();
		}
		if (line.length() > 0) {
			lines.add(line.toString());
		}
		return lines;
	}

	private static Player debugPlayer(MushroomYorkieEntity yorkie) {
		LivingEntity owner = yorkie.getOwner();
		if (owner instanceof Player player) {
			return player;
		}

		if (yorkie.level() instanceof ServerLevel level) {
			return yorkie.playerToStayNear(level);
		}

		return null;
	}
}
