package dev.alicon.mushroomyorkie;

import dev.alicon.mushroomyorkie.entity.ModEntities;
import dev.alicon.mushroomyorkie.entity.MushroomYorkieEntity;
import dev.alicon.mushroomyorkie.item.ModCreativeTabs;
import dev.alicon.mushroomyorkie.item.ModItems;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.object.builder.v1.entity.FabricDefaultAttributeRegistry;
import net.minecraft.resources.ResourceLocation;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Entrypoint and shared identifiers for the Mushroom the Yorkie mod. */
public final class MushroomTheYorkie implements ModInitializer {
	/** Fabric mod id used for registries, assets, and translations. */
	public static final String MOD_ID = "mushroom_yorkie";
	/** Logger scoped to the Mushroom the Yorkie mod id. */
	public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);
	private static MushroomYorkieConfig config;

	@Override
	public void onInitialize() {
		config = MushroomYorkieConfig.load();
		ModEntities.initialize();
		ModItems.initialize();
		ModCreativeTabs.initialize();
		FabricDefaultAttributeRegistry.register(ModEntities.MUSHROOM_YORKIE, MushroomYorkieEntity.createAttributes());
		MushroomWakeUpSpawner.register(config);
		MushroomOwnerTravelHandler.register();

		LOGGER.info("Mushroom the Yorkie initialized");
	}

	/**
	 * Creates an identifier in this mod's namespace.
	 *
	 * @param path resource path inside the `mushroom_yorkie` namespace
	 * @return namespaced Minecraft identifier
	 */
	public static ResourceLocation id(String path) {
		return ResourceLocation.fromNamespaceAndPath(MOD_ID, path);
	}

	/** Runtime gameplay toggle read by interaction code; default true keeps duplicate claims blocked if config load fails. */
	public static boolean oneMushroomPerPlayer() {
		return config == null || config.oneMushroomPerPlayer();
	}

	/** Opt-in in-game behavior diagnostics for playtesting Mushroom decisions. */
	public static boolean debugMessages() {
		return config != null && config.debugMessages();
	}

	/** Gameplay tuning for structure scenting; defaults keep the feature active if config loading fails. */
	public static MushroomStructureScentConfig structureScentConfig() {
		return config == null ? MushroomStructureScentConfig.defaults() : config.structureScent();
	}
}
