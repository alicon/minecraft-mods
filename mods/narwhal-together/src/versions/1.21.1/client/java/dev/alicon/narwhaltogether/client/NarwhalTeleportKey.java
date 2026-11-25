package dev.alicon.narwhaltogether.client;

import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.minecraft.client.KeyMapping;
import org.lwjgl.glfw.GLFW;

final class NarwhalTeleportKey {
	private NarwhalTeleportKey() {
	}

	static KeyMapping register() {
		return KeyBindingHelper.registerKeyBinding(new KeyMapping(
				"key.narwhal_together.teleport_to_player",
				GLFW.GLFW_KEY_G,
				"key.category.narwhal_together.controls"
		));
	}
}
