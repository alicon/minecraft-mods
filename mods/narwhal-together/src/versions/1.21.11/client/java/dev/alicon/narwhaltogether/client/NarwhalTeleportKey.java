package dev.alicon.narwhaltogether.client;

import dev.alicon.narwhaltogether.NarwhalTogether;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.minecraft.client.KeyMapping;

final class NarwhalTeleportKey {
	private NarwhalTeleportKey() {
	}

	static KeyMapping register(String keyName, int keyCode) {
		KeyMapping.Category category =
				KeyMapping.Category.register(NarwhalTogether.id("controls"));
		return KeyBindingHelper.registerKeyBinding(new KeyMapping(
				keyName,
				keyCode,
				category
		));
	}
}
