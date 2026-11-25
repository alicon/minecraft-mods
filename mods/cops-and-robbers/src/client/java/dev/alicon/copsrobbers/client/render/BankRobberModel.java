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

/** Shared standing-height NPC skeleton with separate gear for each uniform. */
public final class BankRobberModel extends EntityModel<BankRobberRenderState> {
	/** Bakes the common humanoid skeleton for the four patrol roles. */
	public static final ModelLayerLocation LAYER_LOCATION = new ModelLayerLocation(CopsAndRobbers.id("bank_robber"), "main");

	/** Role selects independent uniform and gear parts on each render. */
	public enum Role {
		ROBBER,
		COP,
		TELLER,
		FIREFIGHTER
	}

	private final ModelPart head;
	private final ModelPart leftArm;
	private final ModelPart rightArm;
	private final ModelPart leftLeg;
	private final ModelPart rightLeg;
	private final ModelPart stolenGold;
	private final ModelPart knitCap;
	private final ModelPart patrolCap;
	private final ModelPart fireHelmet;
	private final ModelPart satchel;
	private final ModelPart clipboard;
	private final ModelPart airPack;
	private final ModelPart radio;

	/** Binds the standing skeleton and uniform parts from the baked layer. */
	public BankRobberModel(ModelPart root) {
		super(root);
		this.head = root.getChild("head");
		this.leftArm = root.getChild("left_arm");
		this.rightArm = root.getChild("right_arm");
		this.leftLeg = root.getChild("left_leg");
		this.rightLeg = root.getChild("right_leg");
		this.stolenGold = this.rightArm.getChild("stolen_gold");
		this.clipboard = this.leftArm.getChild("clipboard");
		this.knitCap = this.head.getChild("knit_cap");
		this.patrolCap = this.head.getChild("patrol_cap");
		this.fireHelmet = this.head.getChild("fire_helmet");
		ModelPart body = root.getChild("body");
		this.satchel = body.getChild("satchel");
		this.airPack = body.getChild("air_pack");
		this.radio = body.getChild("radio");
	}

	/** Builds the cuboid atlas with feet at Minecraft's model baseline of 24 units. */
	public static LayerDefinition createBodyLayer() {
		MeshDefinition mesh = new MeshDefinition();
		PartDefinition root = mesh.getRoot();
		PartDefinition head = root.addOrReplaceChild("head", CubeListBuilder.create()
				.texOffs(0, 0).addBox(-4, -8, -4, 8, 8, 8), PartPose.ZERO);
		head.addOrReplaceChild("knit_cap", CubeListBuilder.create()
				.texOffs(0, 54).addBox(-4.5F, -9, -4.5F, 9, 3, 9), PartPose.ZERO);
		head.addOrReplaceChild("patrol_cap", CubeListBuilder.create()
				.texOffs(40, 54).addBox(-4.5F, -9, -4.5F, 9, 3, 9)
				.texOffs(80, 54).addBox(-4, -6.7F, -6.8F, 8, 1, 3), PartPose.ZERO);
		head.addOrReplaceChild("fire_helmet", CubeListBuilder.create()
				.texOffs(0, 70).addBox(-5, -9.5F, -5, 10, 3, 10)
				.texOffs(42, 70).addBox(-5.5F, -7, -6, 11, 1, 12), PartPose.ZERO);

		PartDefinition body = root.addOrReplaceChild("body", CubeListBuilder.create()
				.texOffs(16, 16).addBox(-4, 0, -2, 8, 12, 4), PartPose.ZERO);
		body.addOrReplaceChild("satchel", CubeListBuilder.create()
				.texOffs(0, 98).addBox(0.5F, 6, 1.7F, 4, 5, 3), PartPose.ZERO);
		body.addOrReplaceChild("radio", CubeListBuilder.create()
				.texOffs(18, 98).addBox(2, 2, -3, 2, 4, 1)
				.texOffs(26, 98).addBox(3, 0, -2.8F, 1, 3, 1), PartPose.ZERO);
		body.addOrReplaceChild("air_pack", CubeListBuilder.create()
				.texOffs(34, 98).addBox(-3, 2, 2, 6, 8, 3)
				.texOffs(55, 98).addBox(-1, 1, 3, 2, 2, 2), PartPose.ZERO);

		PartDefinition left = root.addOrReplaceChild("left_arm", CubeListBuilder.create()
				.texOffs(40, 16).addBox(-1, -2, -2, 4, 12, 4), PartPose.offset(5, 2, 0));
		left.addOrReplaceChild("clipboard", CubeListBuilder.create()
				.texOffs(66, 98).addBox(-1, 4, -3, 4, 6, 1), PartPose.ZERO);
		PartDefinition right = root.addOrReplaceChild("right_arm", CubeListBuilder.create()
				.texOffs(40, 32).addBox(-3, -2, -2, 4, 12, 4), PartPose.offset(-5, 2, 0));
		right.addOrReplaceChild("stolen_gold", CubeListBuilder.create()
				.texOffs(111, 54).addBox(-3.4F, 7.6F, -3.6F, 4, 2, 3), PartPose.ZERO);
		root.addOrReplaceChild("left_leg", CubeListBuilder.create()
				.texOffs(0, 16).addBox(-2, 0, -2, 4, 12, 4), PartPose.offset(2, 12, 0));
		root.addOrReplaceChild("right_leg", CubeListBuilder.create()
				.texOffs(0, 32).addBox(-2, 0, -2, 4, 12, 4), PartPose.offset(-2, 12, 0));

		return LayerDefinition.create(mesh, 128, 128);
	}

	@Override
	public void setupAnim(BankRobberRenderState state) {
		super.setupAnim(state);
		this.head.xRot = state.xRot * Mth.DEG_TO_RAD;
		this.head.yRot = state.yRot * Mth.DEG_TO_RAD;
		float swing = Mth.cos(state.walkAnimationPos * 0.6662F) * state.walkAnimationSpeed;
		this.leftArm.xRot = 1.45F * swing;
		this.rightArm.xRot = -1.45F * swing;
		this.rightLeg.xRot = 1.4F * swing;
		this.leftLeg.xRot = -1.4F * swing;
		this.knitCap.visible = state.role == Role.ROBBER;
		this.satchel.visible = state.role == Role.ROBBER;
		this.patrolCap.visible = state.role == Role.COP;
		this.radio.visible = state.role == Role.COP;
		this.fireHelmet.visible = state.role == Role.FIREFIGHTER;
		this.airPack.visible = state.role == Role.FIREFIGHTER;
		this.clipboard.visible = state.role == Role.TELLER;
		this.stolenGold.visible = state.stolenGold;
		if (state.stolenGold) {
			this.rightArm.xRot -= 0.55F;
		}
		if (this.clipboard.visible) {
			this.leftArm.xRot = -0.45F + 0.35F * swing;
		}
	}
}
