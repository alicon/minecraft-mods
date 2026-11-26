package dev.alicon.mushroomyorkie.client.render;

import dev.alicon.mushroomyorkie.MushroomTheYorkie;
import dev.alicon.mushroomyorkie.entity.SquirrelEntity;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.MobRenderer;
import net.minecraft.client.renderer.entity.state.LivingEntityRenderState;
import net.minecraft.resources.Identifier;

/** Renderer for the squirrel's chunky cuboid model and warm woodland palette. */
public final class SquirrelRenderer extends MobRenderer<SquirrelEntity, SquirrelRenderer.SquirrelRenderState, SquirrelModel> {
	private static final Identifier TEXTURE = MushroomTheYorkie.id("textures/entity/mushroom_yorkie.png");

	/** Creates a squirrel renderer from the baked client model layer. */
	public SquirrelRenderer(EntityRendererProvider.Context context) {
		super(context, new SquirrelModel(context.bakeLayer(SquirrelModel.LAYER_LOCATION)), 0.22F);
	}

	@Override
	public SquirrelRenderState createRenderState() {
		return new SquirrelRenderState();
	}

	@Override
	public void extractRenderState(SquirrelEntity entity, SquirrelRenderState state, float partialTick) {
		super.extractRenderState(entity, state, partialTick);
		state.treePitch = entity.treePosePitch(partialTick);
		state.treeRoll = entity.treePoseRoll(partialTick);
	}

	@Override
	public Identifier getTextureLocation(SquirrelRenderState state) {
		return TEXTURE;
	}

	/** Client pose state for ground and trunk locomotion. */
	public static final class SquirrelRenderState extends LivingEntityRenderState {
		float treePitch;
		float treeRoll;
	}
}
