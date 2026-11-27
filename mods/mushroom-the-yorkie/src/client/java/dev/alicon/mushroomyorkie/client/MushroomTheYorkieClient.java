package dev.alicon.mushroomyorkie.client;

import dev.alicon.mushroomyorkie.client.render.MushroomYorkieModel;
import dev.alicon.mushroomyorkie.client.render.MushroomYorkieRenderer;
import dev.alicon.mushroomyorkie.client.render.SquirrelModel;
import dev.alicon.mushroomyorkie.client.render.SquirrelRenderer;
import dev.alicon.mushroomyorkie.entity.ModEntities;
import dev.alicon.mushroomyorkie.item.FieldGuidePagesPayload;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.fabricmc.fabric.api.client.rendering.v1.EntityModelLayerRegistry;
import net.minecraft.client.gui.screens.inventory.BookViewScreen;

/** Client entrypoint for Mushroom renderers and model layers. */
public final class MushroomTheYorkieClient implements ClientModInitializer {
	@Override
	public void onInitializeClient() {
		ClientPlayNetworking.registerGlobalReceiver(FieldGuidePagesPayload.TYPE, (payload, context) -> {
			var screen = new BookViewScreen(new BookViewScreen.BookAccess(payload.pages()));
			context.client().setScreen(screen);
			screen.setPage(payload.openPage());
		});
		EntityModelLayerRegistry.registerModelLayer(MushroomYorkieModel.LAYER_LOCATION, MushroomYorkieModel::createBodyLayer);
		EntityModelLayerRegistry.registerModelLayer(SquirrelModel.LAYER_LOCATION, SquirrelModel::createBodyLayer);
		MushroomEntityRendererRegistration.register(ModEntities.MUSHROOM_YORKIE, MushroomYorkieRenderer::new);
		MushroomEntityRendererRegistration.register(ModEntities.SQUIRREL, SquirrelRenderer::new);
	}
}
