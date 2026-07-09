package dev.alicon.playtestbridge;

import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.minecraft.resources.Identifier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Entrypoint for the local playtest HTTP bridge. */
public final class PlaytestBridge implements ModInitializer {
	/** Fabric mod id used for resources and diagnostics. */
	public static final String MOD_ID = "playtest_bridge";
	/** Logger scoped to the playtest bridge mod id. */
	public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);
	private static PlaytestBridgeServer bridgeServer;

	@Override
	public void onInitialize() {
		if (!BridgeSettings.enabled()) {
			LOGGER.info("Playtest bridge disabled by configuration");
			return;
		}

		ServerLifecycleEvents.SERVER_STARTED.register(server -> {
			bridgeServer = new PlaytestBridgeServer(server, BridgeSettings.port());
			bridgeServer.start();
		});
		ServerLifecycleEvents.SERVER_STOPPING.register(server -> {
			if (bridgeServer != null) {
				bridgeServer.stop();
				bridgeServer = null;
			}
		});

		LOGGER.info("Playtest bridge initialized");
	}

	/**
	 * Creates an identifier in this mod's namespace.
	 *
	 * @param path resource path inside the `playtest_bridge` namespace
	 * @return namespaced Minecraft identifier
	 */
	public static Identifier id(String path) {
		return Identifier.fromNamespaceAndPath(MOD_ID, path);
	}
}
