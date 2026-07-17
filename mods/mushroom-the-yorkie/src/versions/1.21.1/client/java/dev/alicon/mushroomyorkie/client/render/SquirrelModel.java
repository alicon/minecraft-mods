package dev.alicon.mushroomyorkie.client.render;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import dev.alicon.mushroomyorkie.MushroomTheYorkie;
import dev.alicon.mushroomyorkie.entity.SquirrelEntity;
import net.minecraft.client.model.EntityModel;
import net.minecraft.client.model.geom.ModelLayerLocation;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.geom.PartPose;
import net.minecraft.client.model.geom.builders.CubeListBuilder;
import net.minecraft.client.model.geom.builders.LayerDefinition;
import net.minecraft.client.model.geom.builders.MeshDefinition;
import net.minecraft.client.model.geom.builders.PartDefinition;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.util.Mth;

/** Minecraft 1.21.1 squirrel model with an intentionally oversized upright tail. */
public final class SquirrelModel extends EntityModel<SquirrelEntity> {
	/** Model layer used when baking the squirrel model. */
	public static final ModelLayerLocation LAYER_LOCATION = new ModelLayerLocation(MushroomTheYorkie.id("squirrel"), "main");
	private final ModelPart root;
	private final ModelPart head;
	private final ModelPart tail;
	private final ModelPart frontLeftLeg;
	private final ModelPart frontRightLeg;
	private final ModelPart backLeftLeg;
	private final ModelPart backRightLeg;

	/** Creates the model from its baked layer. */
	public SquirrelModel(ModelPart root) {
		super(RenderType::entityCutout);
		this.root = root;
		this.head = root.getChild("head");
		ModelPart body = root.getChild("body");
		this.tail = body.getChild("tail");
		this.frontLeftLeg = body.getChild("front_left_leg");
		this.frontRightLeg = body.getChild("front_right_leg");
		this.backLeftLeg = body.getChild("back_left_leg");
		this.backRightLeg = body.getChild("back_right_leg");
	}

	/** Builds the cuboid layer definition for the squirrel renderer. */
	public static LayerDefinition createBodyLayer() {
		MeshDefinition mesh = new MeshDefinition();
		PartDefinition root = mesh.getRoot();
		PartDefinition body = root.addOrReplaceChild("body", CubeListBuilder.create()
				.texOffs(32, 32).addBox(-2.0F, -3.2F, -3.4F, 4.0F, 4.0F, 7.0F)
				.texOffs(20, 16).addBox(-1.3F, -2.3F, -3.65F, 2.6F, 2.6F, 0.6F), PartPose.offset(0.0F, 20.0F, 0.0F));
		PartDefinition head = root.addOrReplaceChild("head", CubeListBuilder.create()
				.texOffs(0, 16).addBox(-2.3F, -4.0F, -2.8F, 4.6F, 4.2F, 4.4F)
				.texOffs(20, 16).addBox(-1.6F, -2.0F, -4.2F, 3.2F, 2.0F, 1.6F), PartPose.offset(0.0F, 18.4F, -3.5F));
		head.addOrReplaceChild("left_eye", CubeListBuilder.create().texOffs(48, 0).addBox(0.65F, -2.9F, -3.0F, 0.8F, 0.8F, 0.25F), PartPose.ZERO);
		head.addOrReplaceChild("right_eye", CubeListBuilder.create().texOffs(48, 0).addBox(-1.45F, -2.9F, -3.0F, 0.8F, 0.8F, 0.25F), PartPose.ZERO);
		head.addOrReplaceChild("nose", CubeListBuilder.create().texOffs(48, 4).addBox(-0.55F, -1.35F, -4.45F, 1.1F, 0.8F, 0.35F), PartPose.ZERO);
		head.addOrReplaceChild("left_ear", CubeListBuilder.create().texOffs(30, 0).addBox(0.0F, -2.7F, -0.6F, 1.8F, 2.7F, 1.2F), PartPose.offsetAndRotation(0.8F, -3.4F, -0.3F, 0.0F, 0.0F, 0.18F));
		head.addOrReplaceChild("right_ear", CubeListBuilder.create().texOffs(30, 5).addBox(-1.8F, -2.7F, -0.6F, 1.8F, 2.7F, 1.2F), PartPose.offsetAndRotation(-0.8F, -3.4F, -0.3F, 0.0F, 0.0F, -0.18F));
		body.addOrReplaceChild("tail", CubeListBuilder.create()
				.texOffs(32, 32).addBox(-2.2F, -5.0F, -1.2F, 4.4F, 5.0F, 3.6F)
				.texOffs(32, 32).addBox(-3.1F, -10.2F, -1.6F, 6.2F, 6.0F, 4.4F)
				.texOffs(32, 32).addBox(-2.4F, -14.0F, -1.0F, 4.8F, 4.5F, 3.4F), PartPose.offsetAndRotation(0.0F, -1.0F, 3.6F, -0.08F, 0.0F, 0.0F));
		body.addOrReplaceChild("front_left_leg", legBuilder(), PartPose.offset(1.35F, 0.5F, -2.35F));
		body.addOrReplaceChild("front_right_leg", legBuilder(), PartPose.offset(-1.35F, 0.5F, -2.35F));
		body.addOrReplaceChild("back_left_leg", legBuilder(), PartPose.offset(1.35F, 0.5F, 2.4F));
		body.addOrReplaceChild("back_right_leg", legBuilder(), PartPose.offset(-1.35F, 0.5F, 2.4F));
		return LayerDefinition.create(mesh, 64, 64);
	}

	private static CubeListBuilder legBuilder() {
		return CubeListBuilder.create().texOffs(36, 0).addBox(-0.6F, 0.0F, -0.6F, 1.2F, 3.5F, 1.2F);
	}

	@Override
	public void setupAnim(SquirrelEntity entity, float limbSwing, float limbSwingAmount, float ageInTicks, float netHeadYaw, float headPitch) {
		this.head.xRot = headPitch * Mth.DEG_TO_RAD;
		this.head.yRot = netHeadYaw * Mth.DEG_TO_RAD;
		this.tail.xRot = -0.08F + Mth.sin(ageInTicks * 0.08F) * 0.05F;
		this.tail.yRot = Mth.sin(ageInTicks * 0.25F) * 0.16F;
		float walk = limbSwing * 0.9F;
		this.frontLeftLeg.xRot = Mth.cos(walk) * 1.3F * limbSwingAmount;
		this.backRightLeg.xRot = Mth.cos(walk) * 1.3F * limbSwingAmount;
		this.frontRightLeg.xRot = Mth.cos(walk + Mth.PI) * 1.3F * limbSwingAmount;
		this.backLeftLeg.xRot = Mth.cos(walk + Mth.PI) * 1.3F * limbSwingAmount;
	}

	@Override
	public void renderToBuffer(PoseStack poseStack, VertexConsumer vertexConsumer, int packedLight, int packedOverlay, int color) {
		this.root.render(poseStack, vertexConsumer, packedLight, packedOverlay, color);
	}
}
