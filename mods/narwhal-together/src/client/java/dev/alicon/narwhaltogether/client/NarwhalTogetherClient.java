package dev.alicon.narwhaltogether.client;

import dev.alicon.narwhaltogether.TeleportToNextPlayerPayload;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;

/** Client entrypoint for NARwhal keybindings and client-to-server requests. */
public final class NarwhalTogetherClient implements ClientModInitializer {
	private static final KeyMapping TELEPORT_TO_PLAYER = NarwhalTeleportKey.register();

	@Override
	public void onInitializeClient() {
		ClientTickEvents.END_CLIENT_TICK.register(client -> {
			while (TELEPORT_TO_PLAYER.consumeClick()) {
				requestTeleport(client);
			}
			if (ControlifyTeleportShortcut.consumeClick(client)) {
				requestTeleport(client);
			}
			SwitchStyleControllerCrafting.tick(client);
		});
	}

	private static void requestTeleport(Minecraft client) {
		if (client.player == null) {
			return;
		}

		if (!ClientPlayNetworking.canSend(TeleportToNextPlayerPayload.TYPE)) {
			client.player.displayClientMessage(
					Component.translatable("message.narwhal_together.server_required"),
					true
			);
			return;
		}

		ClientPlayNetworking.send(TeleportToNextPlayerPayload.INSTANCE);
	}
}
