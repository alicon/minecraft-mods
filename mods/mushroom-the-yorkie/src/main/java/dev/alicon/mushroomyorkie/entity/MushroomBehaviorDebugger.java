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
	private static final int MESSAGE_TICKS = 40;
	private static final int BASELINE_TICKS = 100;
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

		player.displayClientMessage(Component.literal("Mushroom debug: " + detail), true);
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

		ticksByState.put(state, yorkie.tickCount + MESSAGE_TICKS);
		return true;
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
