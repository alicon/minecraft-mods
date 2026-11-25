package dev.alicon.copsrobbers.client.render;

import dev.alicon.copsrobbers.CopsAndRobbers;
import dev.alicon.copsrobbers.entity.PoliceCruiserEntity;
import net.minecraft.client.renderer.entity.MobRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.resources.Identifier;

/** Renderer that binds the Cops and Robbers model layer and texture. */
public final class PoliceCruiserRenderer extends MobRenderer<PoliceCruiserEntity, PoliceCruiserRenderState, PoliceCruiserModel> {
	private static final Identifier TEXTURE = CopsAndRobbers.id("textures/entity/police_cruiser.png");

	/**
	 * Creates the renderer from Minecraft's entity renderer context.
	 *
	 * @param context renderer context that provides the baked model layer
	 */
	public PoliceCruiserRenderer(EntityRendererProvider.Context context) {
		super(context, new PoliceCruiserModel(context.bakeLayer(PoliceCruiserModel.LAYER_LOCATION)), 0.75F);
	}

	@Override
	public PoliceCruiserRenderState createRenderState() {
		return new PoliceCruiserRenderState();
	}

	@Override
	public void extractRenderState(PoliceCruiserEntity entity, PoliceCruiserRenderState state, float partialTick) {
		super.extractRenderState(entity, state, partialTick);
		state.lightsEnabled = entity.lightsEnabled();
		state.sirenEnabled = entity.sirenEnabled();
		state.trickType = entity.trickType();
		state.trickProgress = trickProgress(entity, partialTick);
	}

	static float trickProgress(PoliceCruiserEntity entity, float partialTick) {
		int ticks = entity.trickTicks();
		if (ticks <= 0) {
			return 0.0F;
		}

		float elapsed = PoliceCruiserEntity.TRICK_DURATION_TICKS - ticks + partialTick;
		return Math.clamp(elapsed / PoliceCruiserEntity.TRICK_DURATION_TICKS, 0.0F, 1.0F);
	}

	@Override
	public Identifier getTextureLocation(PoliceCruiserRenderState state) {
		return TEXTURE;
	}
}
