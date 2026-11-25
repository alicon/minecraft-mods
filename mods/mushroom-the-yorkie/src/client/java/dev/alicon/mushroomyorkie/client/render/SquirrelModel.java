package dev.alicon.mushroomyorkie.client.render;

import net.minecraft.client.model.EntityModel;
import net.minecraft.client.model.geom.ModelLayerLocation;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.geom.builders.LayerDefinition;

/** Binds the shared Squirrel model and poses to this Minecraft target's renderer. */
public final class SquirrelModel extends EntityModel<SquirrelRenderer.SquirrelRenderState> {
	/** Registered layer for the baked model. */
	public static final ModelLayerLocation LAYER_LOCATION = SquirrelPose.LAYER_LOCATION;

	private final SquirrelPose pose;

	/** Creates the model from the baked root. */
	public SquirrelModel(ModelPart root) {
		super(root);
		this.pose = new SquirrelPose(root);
	}

	/** Creates the cuboid layer used by the renderer. */
	public static LayerDefinition createBodyLayer() {
		return SquirrelPose.createBodyLayer();
	}

	@Override
	public void setupAnim(SquirrelRenderer.SquirrelRenderState state) {
		super.setupAnim(state);
		this.pose.animate(state.walkAnimationPos, state.walkAnimationSpeed, state.ageInTicks, state.yRot, state.xRot);
	}
}
