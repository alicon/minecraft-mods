package dev.alicon.copsrobbers.client.render;

import dev.alicon.copsrobbers.CopsAndRobbers;
import net.minecraft.client.model.EntityModel;
import net.minecraft.client.model.geom.ModelLayerLocation;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.geom.PartPose;
import net.minecraft.client.model.geom.builders.CubeListBuilder;
import net.minecraft.client.model.geom.builders.LayerDefinition;
import net.minecraft.client.model.geom.builders.MeshDefinition;
import net.minecraft.client.model.geom.builders.PartDefinition;
import net.minecraft.util.Mth;

/** Simple masked robber model with a striped shirt. */
public final class BankRobberModel extends EntityModel<BankRobberRenderState> {
	/** Model layer used when baking the robber model. */
	public static final ModelLayerLocation LAYER_LOCATION = new ModelLayerLocation(CopsAndRobbers.id("bank_robber"), "main");

	private final ModelPart head;
	private final ModelPart leftArm;
	private final ModelPart rightArm;
	private final ModelPart leftLeg;
	private final ModelPart rightLeg;
	private final ModelPart stolenGold;

	/** Binds baked part names; update this constructor and createBodyLayer together when renaming geometry. */
	public BankRobberModel(ModelPart root) {
		super(root);
		this.head = root.getChild("head");
		this.leftArm = root.getChild("left_arm");
		this.rightArm = root.getChild("right_arm");
		this.leftLeg = root.getChild("left_leg");
		this.rightLeg = root.getChild("right_leg");
		this.stolenGold = this.rightArm.getChild("stolen_gold");
	}

	/** Builds the cuboid layer definition for a compact humanoid robber. */
	public static LayerDefinition createBodyLayer() {
		MeshDefinition mesh = new MeshDefinition();
		PartDefinition root = mesh.getRoot();
		root.addOrReplaceChild("head", CubeListBuilder.create()
				.texOffs(0, 0)
				.addBox(-4.0F, -8.0F, -4.0F, 8.0F, 8.0F, 8.0F), PartPose.offset(0.0F, 6.0F, 0.0F));
		root.addOrReplaceChild("body", CubeListBuilder.create()
				.texOffs(16, 16)
				.addBox(-4.0F, 0.0F, -2.0F, 8.0F, 12.0F, 4.0F), PartPose.offset(0.0F, 6.0F, 0.0F));
		root.addOrReplaceChild("left_arm", CubeListBuilder.create()
				.texOffs(40, 16)
				.addBox(-1.0F, -2.0F, -2.0F, 4.0F, 12.0F, 4.0F), PartPose.offset(5.0F, 8.0F, 0.0F));
		PartDefinition rightArm = root.addOrReplaceChild("right_arm", CubeListBuilder.create()
				.texOffs(40, 32)
				.addBox(-3.0F, -2.0F, -2.0F, 4.0F, 12.0F, 4.0F), PartPose.offset(-5.0F, 8.0F, 0.0F));
		rightArm.addOrReplaceChild("stolen_gold", CubeListBuilder.create()
				.texOffs(56, 0)
				.addBox(-3.6F, 7.0F, -3.0F, 3.0F, 2.0F, 2.0F), PartPose.ZERO);
		root.addOrReplaceChild("left_leg", CubeListBuilder.create()
				.texOffs(0, 16)
				.addBox(-2.0F, 0.0F, -2.0F, 4.0F, 12.0F, 4.0F), PartPose.offset(2.0F, 18.0F, 0.0F));
		root.addOrReplaceChild("right_leg", CubeListBuilder.create()
				.texOffs(0, 32)
				.addBox(-2.0F, 0.0F, -2.0F, 4.0F, 12.0F, 4.0F), PartPose.offset(-2.0F, 18.0F, 0.0F));
		return LayerDefinition.create(mesh, 64, 64);
	}

	@Override
	public void setupAnim(BankRobberRenderState state) {
		super.setupAnim(state);
		this.head.xRot = state.xRot * Mth.DEG_TO_RAD;
		this.head.yRot = state.yRot * Mth.DEG_TO_RAD;
		float stride = state.walkAnimationSpeed;
		float swing = state.walkAnimationPos;
		this.rightArm.xRot = Mth.cos(swing * 0.6662F + Mth.PI) * 2.0F * stride;
		this.leftArm.xRot = Mth.cos(swing * 0.6662F) * 2.0F * stride;
		this.rightLeg.xRot = Mth.cos(swing * 0.6662F) * 1.4F * stride;
		this.leftLeg.xRot = Mth.cos(swing * 0.6662F + Mth.PI) * 1.4F * stride;
		this.stolenGold.visible = state.stolenGold;
	}
}
