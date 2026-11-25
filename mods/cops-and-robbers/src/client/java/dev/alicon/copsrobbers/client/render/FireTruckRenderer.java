package dev.alicon.copsrobbers.client.render;

import dev.alicon.copsrobbers.CopsAndRobbers;
import dev.alicon.copsrobbers.entity.FireTruckEntity;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.MobRenderer;
import net.minecraft.resources.Identifier;

/** Renderer that binds the fire engine model and its distinct texture. */
public final class FireTruckRenderer extends MobRenderer<FireTruckEntity, PoliceCruiserRenderState, PoliceCruiserModel> {
	private static final Identifier TEXTURE = CopsAndRobbers.id("textures/entity/fire_truck.png");

	/** Uses the fire truck layer with common vehicle animation. */
	public FireTruckRenderer(EntityRendererProvider.Context context) {
		super(context, new PoliceCruiserModel(context.bakeLayer(PoliceCruiserModel.FIRE_TRUCK_LAYER)), 0.75F);
	}

	@Override
	public PoliceCruiserRenderState createRenderState() {
		return new PoliceCruiserRenderState();
	}

	@Override
	public void extractRenderState(FireTruckEntity entity, PoliceCruiserRenderState state, float partialTick) {
		super.extractRenderState(entity, state, partialTick);
		state.lightsEnabled = entity.lightsEnabled();
		state.sirenEnabled = entity.sirenEnabled();
		state.trickType = entity.trickType();
		state.trickProgress = PoliceCruiserRenderer.trickProgress(entity, partialTick);
	}

	@Override
	public Identifier getTextureLocation(PoliceCruiserRenderState state) {
		return TEXTURE;
	}
}
