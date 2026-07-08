package dev.alicon.copsrobbers.client;

import dev.alicon.copsrobbers.CopsAndRobbers;
import dev.alicon.copsrobbers.client.render.BankRobberModel;
import dev.alicon.copsrobbers.client.render.BankRobberRenderer;
import dev.alicon.copsrobbers.client.render.FireTruckRenderer;
import dev.alicon.copsrobbers.client.render.PoliceCruiserModel;
import dev.alicon.copsrobbers.client.render.PoliceCruiserRenderer;
import dev.alicon.copsrobbers.client.render.PoliceNpcRenderer;
import dev.alicon.copsrobbers.entity.ModEntities;
import net.fabricmc.fabric.api.client.rendering.v1.EntityModelLayerRegistry;
import net.minecraft.client.renderer.entity.EntityRenderers;

final class CopsAndRobbersRenderers {
	private CopsAndRobbersRenderers() {
	}

	static void register() {
		EntityModelLayerRegistry.registerModelLayer(PoliceCruiserModel.LAYER_LOCATION, PoliceCruiserModel::createBodyLayer);
		EntityModelLayerRegistry.registerModelLayer(BankRobberModel.LAYER_LOCATION, BankRobberModel::createBodyLayer);
		EntityRenderers.register(ModEntities.POLICE_CRUISER, PoliceCruiserRenderer::new);
		EntityRenderers.register(ModEntities.FIRE_TRUCK, FireTruckRenderer::new);
		EntityRenderers.register(ModEntities.BANK_ROBBER, BankRobberRenderer::new);
		EntityRenderers.register(ModEntities.TELLER, context ->
				new PoliceNpcRenderer<>(context, CopsAndRobbers.id("textures/entity/teller.png")));
		EntityRenderers.register(ModEntities.COP, context ->
				new PoliceNpcRenderer<>(context, CopsAndRobbers.id("textures/entity/cop.png")));
		EntityRenderers.register(ModEntities.FIREMAN, context ->
				new PoliceNpcRenderer<>(context, CopsAndRobbers.id("textures/entity/fireman.png")));
	}
}
