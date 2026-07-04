package dev.alicon.mushroomyorkie.client.render;

import dev.alicon.mushroomyorkie.MushroomTheYorkie;
import dev.alicon.mushroomyorkie.entity.MushroomYorkieEntity;
import net.minecraft.client.model.EntityModel;
import net.minecraft.client.model.geom.ModelLayerLocation;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.geom.PartPose;
import net.minecraft.client.model.geom.builders.CubeListBuilder;
import net.minecraft.client.model.geom.builders.LayerDefinition;
import net.minecraft.client.model.geom.builders.MeshDefinition;
import net.minecraft.client.model.geom.builders.PartDefinition;
import net.minecraft.util.Mth;

/** Simple client model for Mushroom with pointy ears and a wagging tail. */
public final class MushroomYorkieModel extends EntityModel<MushroomYorkieRenderState> {
	private static final float FULL_SPIN = (float) (Math.PI * 2.0D);
	/** Model layer used when baking the Mushroom Yorkie model. */
	public static final ModelLayerLocation LAYER_LOCATION = new ModelLayerLocation(MushroomTheYorkie.id("mushroom_yorkie"), "main");

	private final ModelPart head;
	private final ModelPart body;
	private final ModelPart leftEye;
	private final ModelPart rightEye;
	private final ModelPart leftEar;
	private final ModelPart rightEar;
	private final ModelPart harness;
	private final ModelPart tail;
	private final ModelPart frontLeftLeg;
	private final ModelPart frontRightLeg;
	private final ModelPart backLeftLeg;
	private final ModelPart backRightLeg;

	/**
	 * Creates the model from a baked root part.
	 *
	 * @param root baked model root from the registered layer definition
	 */
	public MushroomYorkieModel(ModelPart root) {
		super(root);
		this.head = root.getChild("head");
		this.body = root.getChild("body");
		this.leftEye = this.head.getChild("left_eye");
		this.rightEye = this.head.getChild("right_eye");
		this.leftEar = this.head.getChild("left_ear");
		this.rightEar = this.head.getChild("right_ear");
		this.harness = this.body.getChild("harness");
		this.tail = this.body.getChild("tail");
		this.frontLeftLeg = this.body.getChild("front_left_leg");
		this.frontRightLeg = this.body.getChild("front_right_leg");
		this.backLeftLeg = this.body.getChild("back_left_leg");
		this.backRightLeg = this.body.getChild("back_right_leg");
	}

	/**
	 * Builds the Blockbench-style cuboid layer definition used by the renderer.
	 *
	 * @return baked layer definition for Mushroom's model
	 */
	public static LayerDefinition createBodyLayer() {
		MeshDefinition mesh = new MeshDefinition();
		PartDefinition root = mesh.getRoot();

		PartDefinition body = root.addOrReplaceChild("body", CubeListBuilder.create()
				.texOffs(0, 0)
				.addBox(-2.6F, -3.7F, -4.6F, 5.2F, 4.4F, 9.2F)
				.texOffs(0, 0)
				.addBox(-3.0F, -2.9F, -3.8F, 6.0F, 3.0F, 7.6F)
				.texOffs(0, 0)
				.addBox(-2.2F, -4.2F, -3.4F, 4.4F, 1.0F, 6.8F), PartPose.offset(0.0F, 18.0F, 0.0F));

		PartDefinition head = root.addOrReplaceChild("head", CubeListBuilder.create()
				.texOffs(0, 16)
				.addBox(-2.5F, -4.0F, -3.0F, 5.0F, 4.0F, 5.0F)
				.texOffs(0, 16)
				.addBox(-2.9F, -2.5F, -2.4F, 0.8F, 2.1F, 3.4F)
				.texOffs(0, 16)
				.addBox(2.1F, -2.5F, -2.4F, 0.8F, 2.1F, 3.4F)
				.texOffs(20, 16)
				.addBox(-1.5F, -2.0F, -5.0F, 3.0F, 2.0F, 2.0F), PartPose.offset(0.0F, 17.0F, -5.0F));
		head.addOrReplaceChild("left_eye", CubeListBuilder.create()
				.texOffs(48, 0)
				.addBox(0.6F, -2.85F, -3.25F, 0.7F, 0.7F, 0.25F), PartPose.ZERO);
		head.addOrReplaceChild("right_eye", CubeListBuilder.create()
				.texOffs(48, 0)
				.addBox(-1.3F, -2.85F, -3.25F, 0.7F, 0.7F, 0.25F), PartPose.ZERO);
		head.addOrReplaceChild("nose", CubeListBuilder.create()
				.texOffs(48, 4)
				.addBox(-0.55F, -1.45F, -5.25F, 1.1F, 0.75F, 0.35F), PartPose.ZERO);
		head.addOrReplaceChild("left_ear", CubeListBuilder.create()
				.texOffs(30, 0)
				.addBox(0.0F, -3.0F, -1.0F, 2.8F, 3.0F, 1.0F), PartPose.offsetAndRotation(1.0F, -3.0F, 0.0F, 0.0F, 0.0F, 0.28F));
		head.addOrReplaceChild("right_ear", CubeListBuilder.create()
				.texOffs(30, 5)
				.addBox(-2.8F, -3.0F, -1.0F, 2.8F, 3.0F, 1.0F), PartPose.offsetAndRotation(-1.0F, -3.0F, 0.0F, 0.0F, 0.0F, -0.28F));

		body.addOrReplaceChild("tail", CubeListBuilder.create()
				.texOffs(24, 0)
				.addBox(-0.5F, -0.5F, 0.0F, 1.0F, 1.0F, 2.0F), PartPose.offsetAndRotation(0.0F, -2.0F, 5.0F, -0.25F, 0.0F, 0.0F));
		body.addOrReplaceChild("harness", CubeListBuilder.create()
				.texOffs(48, 4)
				.addBox(-2.75F, -4.35F, -2.7F, 5.5F, 0.55F, 1.0F)
				.texOffs(48, 4)
				.addBox(-2.75F, -4.35F, 1.5F, 5.5F, 0.55F, 1.0F)
				.texOffs(48, 4)
				.addBox(-0.35F, -4.45F, -2.5F, 0.7F, 0.65F, 5.0F), PartPose.ZERO);
		body.addOrReplaceChild("front_left_leg", legBuilder(), PartPose.offset(1.8F, 1.0F, -3.2F));
		body.addOrReplaceChild("front_right_leg", legBuilder(), PartPose.offset(-1.8F, 1.0F, -3.2F));
		body.addOrReplaceChild("back_left_leg", legBuilder(), PartPose.offset(1.8F, 1.0F, 3.4F));
		body.addOrReplaceChild("back_right_leg", legBuilder(), PartPose.offset(-1.8F, 1.0F, 3.4F));

		return LayerDefinition.create(mesh, 64, 64);
	}

	private static CubeListBuilder legBuilder() {
		return CubeListBuilder.create().texOffs(36, 0).addBox(-0.75F, 0.0F, -0.75F, 1.5F, 5.0F, 1.5F);
	}

	@Override
	public void setupAnim(MushroomYorkieRenderState state) {
		super.setupAnim(state);
		this.root.xRot = 0.0F;
		this.root.yRot = 0.0F;
		this.root.zRot = 0.0F;
		this.head.xRot = state.xRot * Mth.DEG_TO_RAD;
		this.head.yRot = state.yRot * Mth.DEG_TO_RAD;
		this.head.zRot = 0.0F;
		this.head.y = 17.0F;
		this.body.y = 18.0F;
		this.body.xRot = 0.0F;
		this.body.zRot = 0.0F;
		this.tail.xRot = -0.25F;
		this.harness.visible = state.harness;
		this.leftEye.visible = true;
		this.rightEye.visible = true;
		this.leftEar.zRot = 0.28F + Mth.sin(state.ageInTicks * 0.15F) * 0.04F;
		this.rightEar.zRot = -0.28F - Mth.sin(state.ageInTicks * 0.15F) * 0.04F;
		this.tail.yRot = Mth.sin(state.ageInTicks * 0.55F) * 0.45F;

		float walk = state.walkAnimationPos * 0.6662F;
		float speed = state.walkAnimationSpeed;
		this.frontLeftLeg.xRot = Mth.cos(walk) * 1.4F * speed;
		this.backRightLeg.xRot = Mth.cos(walk) * 1.4F * speed;
		this.frontRightLeg.xRot = Mth.cos(walk + Mth.PI) * 1.4F * speed;
		this.backLeftLeg.xRot = Mth.cos(walk + Mth.PI) * 1.4F * speed;

		if (state.flyingWithOwner) {
			float pitch = Mth.clamp(-state.verticalSpeed * 0.9F, -0.25F, 0.25F);
			this.applyFlightTrick(state);
			this.body.y = 18.0F;
			this.body.xRot = pitch;
			this.head.y = 17.0F;
			this.head.xRot = pitch * 0.35F;
			this.tail.xRot = -0.15F + pitch;
			this.tail.yRot = Mth.sin(state.ageInTicks * 0.9F) * 0.25F;
			this.frontLeftLeg.xRot = -1.15F;
			this.frontRightLeg.xRot = -1.15F;
			this.backLeftLeg.xRot = 0.95F;
			this.backRightLeg.xRot = 0.95F;
			return;
		}

		if (state.sleeping) {
			this.leftEye.visible = false;
			this.rightEye.visible = false;
			this.body.y = 21.4F;
			this.body.xRot = 0.0F;
			this.body.zRot = 0.82F;
			this.head.y = 20.0F;
			this.head.xRot = 0.34F;
			this.head.yRot = 0.0F;
			this.head.zRot = -0.45F;
			this.tail.xRot = 0.95F;
			this.tail.yRot = -0.7F;
			this.frontLeftLeg.xRot = -1.35F;
			this.frontRightLeg.xRot = -1.35F;
			this.backLeftLeg.xRot = -1.25F;
			this.backRightLeg.xRot = -1.25F;
			return;
		}

		if (state.sitting) {
			this.body.y = 20.1F;
			this.body.xRot = -0.38F;
			this.head.y = 17.1F;
			this.tail.xRot = 0.65F;
			this.tail.yRot = 0.0F;
			this.frontLeftLeg.xRot = -0.95F;
			this.frontRightLeg.xRot = -0.95F;
			this.backLeftLeg.xRot = -0.95F;
			this.backRightLeg.xRot = -0.95F;
		}
	}

	private void applyFlightTrick(MushroomYorkieRenderState state) {
		float spin = state.flightTrickProgress * FULL_SPIN;
		if (state.flightTrickType == MushroomYorkieEntity.FLIGHT_TRICK_BARREL_ROLL) {
			this.body.zRot = spin;
			this.head.zRot = spin;
		} else if (state.flightTrickType == MushroomYorkieEntity.FLIGHT_TRICK_LOOP) {
			this.root.xRot = -spin;
		}
	}
}
