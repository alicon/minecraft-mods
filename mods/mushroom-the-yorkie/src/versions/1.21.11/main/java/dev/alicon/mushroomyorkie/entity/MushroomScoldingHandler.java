package dev.alicon.mushroomyorkie.entity;

import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.player.Player;

final class MushroomScoldingHandler {
	private static final int SCARED_RUN_TICKS = 20 * 12;

	private MushroomScoldingHandler() {
	}

	static void recordTrustedPlayerHit(MushroomYorkieEntity yorkie, ServerLevel level, Player player) {
		if (!yorkie.trust.recordTrustedPlayerHit(level, player)) {
			return;
		}

		yorkie.scaredRunTicks = SCARED_RUN_TICKS;
		MushroomBehaviorDebugger.debug(yorkie, "scolded", "scolded: trusted player hit Mushroom, backing away", true);
		yorkie.setMushroomOrderedToSit(false);
		yorkie.setSleeping(false);
		yorkie.setOwner(null);
		yorkie.setTame(false, true);
		MushroomYorkieSounds.playScoldedWhine(yorkie);
	}
}
