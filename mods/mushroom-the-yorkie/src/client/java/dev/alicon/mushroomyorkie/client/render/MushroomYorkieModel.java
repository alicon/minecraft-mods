package dev.alicon.mushroomyorkie.client.render;

import net.minecraft.client.model.EntityModel;
import net.minecraft.client.model.geom.ModelLayerLocation;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.geom.builders.LayerDefinition;

/** Binds the shared MushroomYorkie model and poses to this Minecraft target's renderer. */
public final class MushroomYorkieModel extends EntityModel<MushroomYorkieRenderState> {
	/** Registered layer for the baked model. */
	public static final ModelLayerLocation LAYER_LOCATION = MushroomYorkiePose.LAYER_LOCATION;

	private final MushroomYorkiePose pose;

	/** Creates the model from the baked root. */
	public MushroomYorkieModel(ModelPart root) {
		super(root);
		this.pose = new MushroomYorkiePose(root);
	}

	/** Creates the cuboid layer used by the renderer. */
	public static LayerDefinition createBodyLayer() {
		return MushroomYorkiePose.createBodyLayer();
	}

	@Override
	public void setupAnim(MushroomYorkieRenderState state) {
		super.setupAnim(state);
		this.pose.animate(state.walkAnimationPos, state.walkAnimationSpeed, state.ageInTicks, state.yRot, state.xRot,
				state.harness, state.sitting, state.sleeping, state.flyingWithOwner,
				state.verticalSpeed, state.flightTrickType, state.flightTrickProgress);
	}
}
