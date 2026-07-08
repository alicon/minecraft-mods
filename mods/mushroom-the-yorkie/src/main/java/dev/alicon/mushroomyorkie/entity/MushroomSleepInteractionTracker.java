package dev.alicon.mushroomyorkie.entity;

import java.util.UUID;
import net.minecraft.world.entity.player.Player;

final class MushroomSleepInteractionTracker {
	private static final int NIGHT_WAKE_TICKS = 20 * 20;
	private static final int DOUBLE_CLICK_TICKS = 8;

	private int lastInteractTick = -DOUBLE_CLICK_TICKS;
	private UUID lastInteractPlayer;

	boolean handle(MushroomYorkieEntity yorkie, Player player) {
		boolean doubleClick = this.lastInteractPlayer != null
				&& this.lastInteractPlayer.equals(player.getUUID())
				&& yorkie.tickCount - this.lastInteractTick <= DOUBLE_CLICK_TICKS;
		this.lastInteractPlayer = player.getUUID();
		this.lastInteractTick = yorkie.tickCount;

		if (doubleClick) {
			yorkie.nightWakeTicks = NIGHT_WAKE_TICKS;
			yorkie.setSleeping(false);
			MushroomYorkieSounds.playSleepWake(yorkie);
		}
		return doubleClick;
	}
}
