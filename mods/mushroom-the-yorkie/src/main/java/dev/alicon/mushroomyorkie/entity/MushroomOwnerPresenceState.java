package dev.alicon.mushroomyorkie.entity;

import net.minecraft.server.level.ServerLevel;

final class MushroomOwnerPresenceState {
	private static final int PEACEFUL_MOB_BARK_MUTED_TICKS = 6_000;

	private long peacefulMobBarkMutedUntil = -1L;
	private long lastOwnerContactGameTime;

	void mutePeacefulMobBarking(ServerLevel level, MushroomYorkieEntity yorkie) {
		this.peacefulMobBarkMutedUntil = level.getGameTime() + PEACEFUL_MOB_BARK_MUTED_TICKS;
		yorkie.peacefulMobMemory.rememberNearby(level, yorkie);
	}

	boolean peacefulMobBarkingMuted(ServerLevel level) {
		return level.getGameTime() < this.peacefulMobBarkMutedUntil;
	}

	long peacefulMobBarkMutedUntil() {
		return this.peacefulMobBarkMutedUntil;
	}

	void setPeacefulMobBarkMutedUntil(long gameTime) {
		this.peacefulMobBarkMutedUntil = gameTime;
	}

	void recordOwnerContact(ServerLevel level) {
		this.lastOwnerContactGameTime = level.getGameTime();
	}

	long lastOwnerContactGameTime() {
		return this.lastOwnerContactGameTime;
	}

	void setLastOwnerContactGameTime(long gameTime) {
		this.lastOwnerContactGameTime = gameTime;
	}

	void recoverWithOwner(MushroomYorkieEntity yorkie, ServerLevel level) {
		yorkie.stopRiding();
		yorkie.setMushroomOrderedToSit(false);
		yorkie.setSleeping(false);
		this.recordOwnerContact(level);
	}
}
