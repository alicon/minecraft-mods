package dev.alicon.copsrobbers.client;

import dev.alicon.copsrobbers.entity.PoliceCruiserEntity;
import net.fabricmc.api.ClientModInitializer;
import net.minecraft.client.Minecraft;

/** Client entrypoint for Cops and Robbers renderers and model layers. */
public final class CopsAndRobbersClient implements ClientModInitializer {
	@Override
	public void onInitializeClient() {
		CopsAndRobbersRenderers.register();
		CruiserKeyboardControls.register();
	}

	static boolean isDrivingCruiser(Minecraft client) {
		return client.screen == null
				&& client.player != null
				&& client.player.getVehicle() instanceof PoliceCruiserEntity;
	}
}
