package dev.alicon.copsrobbers.client.render;

import dev.alicon.copsrobbers.CopsAndRobbers;
import dev.alicon.copsrobbers.entity.PoliceCruiserEntity;
import net.minecraft.client.model.EntityModel;
import net.minecraft.client.model.geom.ModelLayerLocation;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.geom.PartPose;
import net.minecraft.client.model.geom.builders.CubeListBuilder;
import net.minecraft.client.model.geom.builders.LayerDefinition;
import net.minecraft.client.model.geom.builders.MeshDefinition;
import net.minecraft.client.model.geom.builders.PartDefinition;
import net.minecraft.util.Mth;

/** Two purpose-built vehicle silhouettes sharing wheel and stunt animation. */
public final class PoliceCruiserModel extends EntityModel<PoliceCruiserRenderState> {
	/** Model layer for the short-wheelbase police cruiser. */
	public static final ModelLayerLocation LAYER_LOCATION = new ModelLayerLocation(CopsAndRobbers.id("police_cruiser"), "main");
	/** Model layer for the longer fire engine with its own cab and equipment body. */
	public static final ModelLayerLocation FIRE_TRUCK_LAYER = new ModelLayerLocation(CopsAndRobbers.id("fire_truck"), "main");

	private final ModelPart[] wheels;
	private final ModelPart lightbarLeft;
	private final ModelPart lightbarRight;

	/** Binds the common animated parts from either vehicle layer. */
	public PoliceCruiserModel(ModelPart root) {
		super(root);
		this.wheels = new ModelPart[] {
				root.getChild("front_left_wheel"), root.getChild("front_right_wheel"),
				root.getChild("rear_left_wheel"), root.getChild("rear_right_wheel")
		};
		this.lightbarLeft = root.getChild("lightbar_left");
		this.lightbarRight = root.getChild("lightbar_right");
	}

	/** Bakes the cruiser chassis, roof bar, push bar and angled-profile bonnet. */
	public static LayerDefinition createBodyLayer() {
		MeshDefinition mesh = new MeshDefinition();
		PartDefinition root = mesh.getRoot();
		box(root, "chassis", 0, 0, -13, 14, -19, 26, 6, 38);
		box(root, "cab", 0, 56, -11, 5, -8, 22, 9, 17);
		box(root, "hood", 102, 59, -12, 11, -18, 24, 3, 10);
		box(root, "trunk", 102, 78, -12, 12, 9, 24, 2, 9);
		box(root, "push_bar", 214, 98, -9, 15, -21, 18, 4, 2);
		box(root, "rear_bumper", 214, 98, -9, 17, 19, 18, 4, 2);
		addRunningGear(root, 13, -12, 12, 4, -1);
		return LayerDefinition.create(mesh, 256, 128);
	}

	/** Bakes the fire engine cab, compartment body, roof ladder, and water cannon. */
	public static LayerDefinition createFireTruckLayer() {
		MeshDefinition mesh = new MeshDefinition();
		PartDefinition root = mesh.getRoot();
		box(root, "chassis", 0, 0, -16, 15, -22, 32, 6, 46);
		box(root, "cab", 0, 56, -15, 4, -19, 30, 11, 15);
		box(root, "equipment", 100, 58, -15, 7, -3, 30, 8, 26);
		box(root, "push_bar", 214, 98, -9, 16, -24, 18, 4, 2);
		box(root, "rear_bumper", 214, 98, -9, 17, 24, 18, 4, 2);
		addRunningGear(root, 17, -14, 15, 3, -10);

		CubeListBuilder ladder = CubeListBuilder.create()
				.texOffs(0, 101).addBox(-4, 5, 0, 1, 1, 22)
				.texOffs(0, 101).addBox(3, 5, 0, 1, 1, 22);
		for (int z = 1; z < 22; z += 3) {
			ladder.texOffs(52, 113).addBox(-3, 5, z, 6, 1, 1);
		}
		root.addOrReplaceChild("ladder", ladder, PartPose.ZERO);
		root.addOrReplaceChild("water_cannon", CubeListBuilder.create()
				.texOffs(82, 110).addBox(-2, 2, -17, 4, 2, 4)
				.texOffs(105, 112).addBox(-1, 1.5F, -22, 2, 2, 7), PartPose.ZERO);
		return LayerDefinition.create(mesh, 256, 128);
	}

	private static void addRunningGear(PartDefinition root, int axleX, int frontZ, int rearZ, int barY, int barZ) {
		wheel(root, "front_left_wheel", -axleX, frontZ);
		wheel(root, "front_right_wheel", axleX, frontZ);
		wheel(root, "rear_left_wheel", -axleX, rearZ);
		wheel(root, "rear_right_wheel", axleX, rearZ);
		box(root, "lightbar_housing", 178, 22, -8, barY, barZ, 16, 2, 4);
		box(root, "lightbar_left", 178, 0, -7, barY - 1, barZ, 6, 2, 4);
		box(root, "lightbar_right", 206, 0, 1, barY - 1, barZ, 6, 2, 4);
	}

	private static void wheel(PartDefinition root, String name, int x, int z) {
		root.addOrReplaceChild(name, CubeListBuilder.create()
				.texOffs(178, 38).addBox(-2, -4, -4, 4, 8, 8)
				.texOffs(207, 38).addBox(x > 0 ? 1.5F : -2.5F, -2, -2, 1, 4, 4), PartPose.offset(x, 20, z));
	}

	private static void box(PartDefinition root, String name, int u, int v,
			float x, float y, float z, int width, int height, int depth) {
		root.addOrReplaceChild(name, CubeListBuilder.create()
				.texOffs(u, v).addBox(x, y, z, width, height, depth), PartPose.ZERO);
	}

	@Override
	public void setupAnim(PoliceCruiserRenderState state) {
		super.setupAnim(state);
		this.root.xRot = 0;
		this.root.zRot = 0;
		float wheelSpin = state.walkAnimationPos * 1.25F;
		for (ModelPart wheel : this.wheels) {
			wheel.xRot = wheelSpin;
		}
		boolean left = (int) (state.ageInTicks / (state.sirenEnabled ? 8.0F : 12.0F)) % 2 == 0;
		this.lightbarLeft.visible = state.lightsEnabled && left;
		this.lightbarRight.visible = state.lightsEnabled && !left;

		float spin = state.trickProgress * Mth.TWO_PI;
		if (state.trickType == PoliceCruiserEntity.TRICK_BARREL_ROLL) {
			this.root.zRot = spin;
		} else if (state.trickType == PoliceCruiserEntity.TRICK_LOOP) {
			this.root.xRot = -spin;
		}
	}
}
