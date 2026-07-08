package dev.alicon.mushroomyorkie.client;

import dev.alicon.mushroomyorkie.client.render.MushroomYorkieModel;
import dev.alicon.mushroomyorkie.client.render.MushroomYorkieRenderer;
import dev.alicon.mushroomyorkie.entity.ModEntities;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.rendering.v1.EntityModelLayerRegistry;

/** Client entrypoint for Mushroom renderers and model layers. */
public final class MushroomTheYorkieClient implements ClientModInitializer {
	@Override
	public void onInitializeClient() {
		EntityModelLayerRegistry.registerModelLayer(MushroomYorkieModel.LAYER_LOCATION, MushroomYorkieModel::createBodyLayer);
		MushroomEntityRendererRegistration.register(ModEntities.MUSHROOM_YORKIE, MushroomYorkieRenderer::new);
	}
}
