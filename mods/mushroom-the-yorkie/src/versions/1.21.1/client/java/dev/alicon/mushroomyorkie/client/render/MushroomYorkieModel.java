package dev.alicon.mushroomyorkie.client.render;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.alicon.mushroomyorkie.entity.MushroomYorkieEntity;
import net.minecraft.client.model.EntityModel;
import net.minecraft.client.model.geom.ModelLayerLocation;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.geom.builders.LayerDefinition;
import net.minecraft.client.renderer.RenderType;

/** Binds the shared MushroomYorkie model and poses to this Minecraft target's renderer. */
public final class MushroomYorkieModel extends EntityModel<MushroomYorkieEntity> {
	/** Registered layer for the baked model. */
	public static final ModelLayerLocation LAYER_LOCATION = MushroomYorkiePose.LAYER_LOCATION;

	private final ModelPart root;
	private final MushroomYorkiePose pose;

	/** Creates the model from the baked root. */
	public MushroomYorkieModel(ModelPart root) {
		super(RenderType::entityCutout);
		this.root = root;
		this.pose = new MushroomYorkiePose(root);
	}

	/** Creates the cuboid layer used by the renderer. */
	public static LayerDefinition createBodyLayer() {
		return MushroomYorkiePose.createBodyLayer();
	}

	@Override
	public void setupAnim(MushroomYorkieEntity entity, float limbSwing, float limbSwingAmount, float ageInTicks, float netHeadYaw, float headPitch) {
		boolean flying = entity.isNoGravity() && !entity.onGround();
		this.pose.animate(limbSwing, limbSwingAmount, ageInTicks, netHeadYaw, headPitch,
				entity.hasHarness(), entity.isInSittingPose() || entity.isOrderedToSit(), entity.isCurledUpSleeping(), flying,
				(float) entity.getDeltaMovement().y, entity.getFlightTrickType(),
				flying ? MushroomYorkieRenderer.flightTrickProgress(entity, 0.0F) : 0.0F);
	}

	@Override
	public void renderToBuffer(PoseStack poseStack, VertexConsumer vertexConsumer, int packedLight, int packedOverlay, int color) {
		this.root.render(poseStack, vertexConsumer, packedLight, packedOverlay, color);
	}
}
