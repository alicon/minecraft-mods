package dev.alicon.mushroomyorkie.entity;

import java.util.HashMap;
import java.util.Map;
import java.util.WeakHashMap;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.player.Player;

final class MushroomOwnerNotice {
	static final int SHORT_COOLDOWN_TICKS = 20 * 30;
	static final int MEDIUM_COOLDOWN_TICKS = 20 * 60;
	static final int LONG_COOLDOWN_TICKS = 20 * 120;
	private static final String[] NICKNAMES = {"Mushy", "Mush", "Dingle", "Mushroom"};
	private static final Map<MushroomYorkieEntity, NoticeState> STATES = new WeakHashMap<>();

	private MushroomOwnerNotice() {
	}

	static void send(MushroomYorkieEntity yorkie, String key, int cooldownTicks, Object... args) {
		if (!(yorkie.getOwner() instanceof Player owner) || owner.level() != yorkie.level()) {
			return;
		}

		NoticeState state = STATES.computeIfAbsent(yorkie, ignored -> new NoticeState());
		int nextTick = state.nextTicks.getOrDefault(key, Integer.MIN_VALUE);
		if (cooldownTicks > 0 && yorkie.tickCount < nextTick) {
			return;
		}

		state.nextTicks.put(key, yorkie.tickCount + cooldownTicks);
		Object[] messageArgs = new Object[args.length + 1];
		messageArgs[0] = state.nextNickname();
		System.arraycopy(args, 0, messageArgs, 1, args.length);
		owner.displayClientMessage(Component.translatable(key, messageArgs), true);
	}

	private static final class NoticeState {
		private final Map<String, Integer> nextTicks = new HashMap<>();
		private int nicknameIndex;

		private String nextNickname() {
			String nickname = NICKNAMES[this.nicknameIndex];
			this.nicknameIndex = (this.nicknameIndex + 1) % NICKNAMES.length;
			return nickname;
		}
	}
}
