package dev.alicon.mushroomyorkie.entity;

import net.minecraft.core.GlobalPos;

final class MushroomCampState {
	static final String ANCHOR_KEY = "ExpeditionCamp";
	static final String HOLDING_KEY = "ExpeditionCampHold";

	private GlobalPos anchor;
	private boolean holding;

	GlobalPos anchor() {
		return this.anchor;
	}

	boolean holding() {
		return this.holding;
	}

	void mark(GlobalPos anchor) {
		this.anchor = anchor;
	}

	void setHolding(boolean holding) {
		this.holding = holding;
	}
}
