package dev.alicon.playtestbridge;

import java.util.function.Consumer;

/** Release only the owned key, including a toggle setting changed during cancellation. */
final class BridgeOwnedShift {
	private BridgeOwnedShift() {
	}

	static void release(boolean down, boolean toggleMode, Consumer<Boolean> setDown) {
		// Pinned ToggleKeyMapping ignores false and flips on true. A held key
		// needs one true to turn off; repeated releases must leave it off.
		setDown.accept(down && toggleMode);
	}
}
