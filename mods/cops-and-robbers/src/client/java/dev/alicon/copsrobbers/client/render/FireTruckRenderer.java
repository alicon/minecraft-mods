package dev.alicon.copsrobbers.client.render;

import dev.alicon.copsrobbers.CopsAndRobbers;
import dev.alicon.copsrobbers.entity.FireTruckEntity;
import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.MobRenderer;
import net.minecraft.resources.Identifier;

/** Renderer that reuses the truck model with fire truck colors. */
public final class FireTruckRenderer extends MobRenderer<FireTruckEntity, PoliceCruiserRenderState, PoliceCruiserModel> {
	private static final Identifier TEXTURE = CopsAndRobbers.id("textures/entity/fire_truck.png");

	/** Reuses PoliceCruiserModel with fire-truck texture/state; avoid a second truck model unless geometry diverges. */
	public FireTruckRenderer(EntityRendererProvider.Context context) {
		super(context, new PoliceCruiserModel(context.bakeLayer(PoliceCruiserModel.LAYER_LOCATION)), 0.75F);
	}

	@Override
	public PoliceCruiserRenderState createRenderState() {
		return new PoliceCruiserRenderState();
	}

	@Override
	public void extractRenderState(FireTruckEntity entity, PoliceCruiserRenderState state, float partialTick) {
		super.extractRenderState(entity, state, partialTick);
		state.lightsEnabled = true;
		state.sirenEnabled = false;
		state.trickType = entity.trickType();
		state.trickProgress = 0.0F;
		state.fireTruck = true;
	}

	@Override
	protected void scale(PoliceCruiserRenderState state, PoseStack poseStack) {
		poseStack.scale(1.55F, 1.48F, 1.55F);
	}

	@Override
	public Identifier getTextureLocation(PoliceCruiserRenderState state) {
		return TEXTURE;
	}
}
