package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.MushroomStructureScentConfig;
import dev.alicon.mushroomyorkie.MushroomTheYorkie;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.player.Player;

final class StructureScentNotifier {
	private static final int FOLLOW_MESSAGE_TICKS = 120;
	private static final int DEBUG_MESSAGE_TICKS = 40;

	private final MushroomYorkieEntity yorkie;
	private int nextMessageTick;
	private int nextDebugMessageTick;

	StructureScentNotifier(MushroomYorkieEntity yorkie) {
		this.yorkie = yorkie;
	}

	void reset() {
		this.nextMessageTick = FOLLOW_MESSAGE_TICKS;
		this.nextDebugMessageTick = 0;
	}

	void message(MushroomStructureScentConfig config, StructureScent scent, String key, boolean immediate) {
		if (!config.messages() || !(this.yorkie.getOwner() instanceof Player)) {
			return;
		}
		if (!immediate && this.nextMessageTick-- > 0) {
			return;
		}

		this.nextMessageTick = FOLLOW_MESSAGE_TICKS;
		if (key.endsWith("start") || key.endsWith("arrived")) {
			MushroomOwnerNotice.send(this.yorkie, key, 0, Component.translatable(scent.target().descriptionKey()));
		} else {
			MushroomOwnerNotice.send(this.yorkie, key, 0);
		}
	}

	void debugState(
			MushroomStructureScentConfig config,
			StructureScent scent,
			String state,
			String key,
			boolean immediate,
			int blockedTicks,
			int recoveryTicks,
			int circleBackTicks
	) {
		boolean debugEnabled = config.debugMessages() || MushroomTheYorkie.debugMessages();
		if (!debugEnabled || !(this.yorkie.getOwner() instanceof Player owner)) {
			return;
		}
		if (!immediate && this.nextDebugMessageTick-- > 0) {
			return;
		}

		this.nextDebugMessageTick = DEBUG_MESSAGE_TICKS;
		owner.displayClientMessage(Component.translatable(key, Component.translatable(scent.target().descriptionKey())), true);
		MushroomTheYorkie.LOGGER.info(
				"Mushroom scent debug: state={} target={} distanceToOwner={} blockedTicks={} recoveryTicks={} circleBackTicks={}",
				state,
				scent.target(),
				this.yorkie.getOwner() == null ? -1.0D : Math.sqrt(this.yorkie.distanceToSqr(this.yorkie.getOwner())),
				blockedTicks,
				recoveryTicks,
				circleBackTicks
		);
	}
}
