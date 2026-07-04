package dev.alicon.mushroomyorkie.client.render;

import dev.alicon.mushroomyorkie.MushroomTheYorkie;
import dev.alicon.mushroomyorkie.entity.MushroomYorkieEntity;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.MobRenderer;
import net.minecraft.resources.Identifier;

/** Renderer that binds Mushroom's model layer and texture. */
public final class MushroomYorkieRenderer extends MobRenderer<MushroomYorkieEntity, MushroomYorkieRenderState, MushroomYorkieModel> {
	private static final Identifier TEXTURE = MushroomTheYorkie.id("textures/entity/mushroom_yorkie.png");

	/**
	 * Creates the renderer from Minecraft's entity renderer context.
	 *
	 * @param context renderer context that provides the baked model layer
	 */
	public MushroomYorkieRenderer(EntityRendererProvider.Context context) {
		super(context, new MushroomYorkieModel(context.bakeLayer(MushroomYorkieModel.LAYER_LOCATION)), 0.25F);
	}

	@Override
	public MushroomYorkieRenderState createRenderState() {
		return new MushroomYorkieRenderState();
	}

	@Override
	public void extractRenderState(MushroomYorkieEntity entity, MushroomYorkieRenderState state, float partialTick) {
		super.extractRenderState(entity, state, partialTick);
		state.sleeping = entity.isCurledUpSleeping();
		state.sitting = entity.isInSittingPose() || entity.isOrderedToSit();
		state.harness = entity.hasHarness();
		state.flyingWithOwner = entity.isNoGravity() && !entity.onGround();
		state.verticalSpeed = (float) entity.getDeltaMovement().y;
		state.flightTrickType = entity.getFlightTrickType();
		state.flightTrickProgress = flightTrickProgress(entity, partialTick);
	}

	private static float flightTrickProgress(MushroomYorkieEntity entity, float partialTick) {
		int ticks = entity.getFlightTrickTicks();
		if (ticks <= 0) {
			return 0.0F;
		}

		float elapsed = MushroomYorkieEntity.FLIGHT_TRICK_DURATION_TICKS - ticks + partialTick;
		return Math.clamp(elapsed / MushroomYorkieEntity.FLIGHT_TRICK_DURATION_TICKS, 0.0F, 1.0F);
	}

	@Override
	public Identifier getTextureLocation(MushroomYorkieRenderState state) {
		return TEXTURE;
	}
}
