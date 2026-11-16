package dev.alicon.playtestbridge;

import static org.junit.jupiter.api.Assertions.assertFalse;

import java.util.function.Consumer;
import org.junit.jupiter.api.Test;

/** Models the pinned ToggleKeyMapping semantics, not a live keyboard result. */
class BridgeOwnedShiftTest {
	@Test
	void heldAndToggleKeysStayReleasedAcrossRepeatedCleanup() {
		for (boolean toggle : new boolean[] {false, true}) {
			var key = new Key();key.toggle = toggle;key.down = true;
			BridgeOwnedShift.release(key.down, key.toggle, key);
			assertFalse(key.down);
			BridgeOwnedShift.release(key.down, key.toggle, key);
			assertFalse(key.down);
		}
	}

	@Test
	void aSettingChangedAfterPressCannotLeaveTheOwnedKeyLatched() {
		for (boolean initialToggle : new boolean[] {false, true}) {
			var key = new Key();key.toggle = initialToggle;key.accept(true);
			key.toggle = !initialToggle;
			BridgeOwnedShift.release(key.down, key.toggle, key);
			assertFalse(key.down);
		}
	}

	private static final class Key implements Consumer<Boolean> {
		boolean toggle, down;
		@Override public void accept(Boolean pressed) {
			if (this.toggle) { if (pressed) this.down = !this.down; }
			else this.down = pressed;
		}
	}
}
