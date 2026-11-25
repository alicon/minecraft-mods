package dev.alicon.narwhaltogether.client;

import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.minecraft.client.KeyMapping;

final class NarwhalTeleportKey {
	private NarwhalTeleportKey() {
	}

	static KeyMapping register(String keyName, int keyCode) {
		return KeyBindingHelper.registerKeyBinding(new KeyMapping(
				keyName,
				keyCode,
				"key.category.narwhal_together.controls"
		));
	}
}
