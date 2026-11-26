package dev.alicon.mushroomyorkie.client.render;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.alicon.mushroomyorkie.entity.SquirrelEntity;
import net.minecraft.client.model.EntityModel;
import net.minecraft.client.model.geom.ModelLayerLocation;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.geom.builders.LayerDefinition;
import net.minecraft.client.renderer.RenderType;

/** Binds the shared Squirrel model and poses to this Minecraft target's renderer. */
public final class SquirrelModel extends EntityModel<SquirrelEntity> {
	/** Registered layer for the baked model. */
	public static final ModelLayerLocation LAYER_LOCATION = SquirrelPose.LAYER_LOCATION;

	private final ModelPart root;
	private final SquirrelPose pose;

	/** Creates the model from the baked root. */
	public SquirrelModel(ModelPart root) {
		super(RenderType::entityCutout);
		this.root = root;
		this.pose = new SquirrelPose(root);
	}

	/** Creates the cuboid layer used by the renderer. */
	public static LayerDefinition createBodyLayer() {
		return SquirrelPose.createBodyLayer();
	}

	@Override
	public void setupAnim(SquirrelEntity entity, float limbSwing, float limbSwingAmount, float ageInTicks, float netHeadYaw, float headPitch) {
		float partialTick = ageInTicks - entity.tickCount;
		this.pose.animate(limbSwing, limbSwingAmount, ageInTicks, netHeadYaw, headPitch,
				entity.treePosePitch(partialTick), entity.treePoseRoll(partialTick));
	}

	@Override
	public void renderToBuffer(PoseStack poseStack, VertexConsumer vertexConsumer, int packedLight, int packedOverlay, int color) {
		this.root.render(poseStack, vertexConsumer, packedLight, packedOverlay, color);
	}
}
