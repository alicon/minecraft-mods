package dev.alicon.narwhaltogether;

import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Entrypoint and shared identifiers for the NARwhal Together mod. */
public final class NarwhalTogether implements ModInitializer {
	/** Fabric mod id used for registries, packets, assets, and translations. */
	public static final String MOD_ID = "narwhal_together";
	/** Logger scoped to the NARwhal Together mod id. */
	public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);

	@Override
	public void onInitialize() {
		PayloadTypeRegistry.playC2S().register(
				TeleportToNextPlayerPayload.TYPE,
				TeleportToNextPlayerPayload.CODEC
		);
		ServerPlayNetworking.registerGlobalReceiver(
				TeleportToNextPlayerPayload.TYPE,
				(payload, context) -> PlayerTeleporter.teleportToNextPlayer(context.player())
		);

		LOGGER.info("NARwhal Together initialized");
	}
}
