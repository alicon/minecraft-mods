package dev.alicon.mushroomyorkie.entity;

import net.minecraft.core.BlockPos;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.AgeableMob;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.goal.AvoidEntityGoal;
import net.minecraft.world.entity.ai.goal.BreedGoal;
import net.minecraft.world.entity.ai.goal.FloatGoal;
import net.minecraft.world.entity.ai.goal.LookAtPlayerGoal;
import net.minecraft.world.entity.ai.goal.RandomLookAroundGoal;
import net.minecraft.world.entity.ai.goal.RandomStrollGoal;
import net.minecraft.world.entity.ai.goal.TemptGoal;
import net.minecraft.world.entity.ai.navigation.GroundPathNavigation;
import net.minecraft.world.entity.ai.navigation.PathNavigation;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.crafting.Ingredient;
import net.minecraft.world.level.Level;

/** Small woodland squirrel whose first instinct is always to find a nearby tree. */
public final class SquirrelEntity extends net.minecraft.world.entity.animal.Animal {
	private static final EntityDataAccessor<Byte> TREE_POSE = SynchedEntityData.defineId(SquirrelEntity.class, EntityDataSerializers.BYTE);
	// Degrees above horizontal; the client approaches a new pose over successive ticks.
	private static final float TREE_PITCH_DEGREES = 78.0F;
	static final byte UNDER_LEAVES = 2;
	private float previousTreeRoll;
	private float treeRoll;
	private boolean foundTree;
	private boolean treeClimbing;
	private float previousTreePitch;
	private float treePitch;

	/** Creates a squirrel in the supplied world. */
	public SquirrelEntity(EntityType<? extends SquirrelEntity> entityType, Level level) {
		super(entityType, level);
	}

	@Override
	protected void defineSynchedData(SynchedEntityData.Builder builder) {
		super.defineSynchedData(builder);
		builder.define(TREE_POSE, (byte) 0);
	}

	@Override
	public void tick() {
		super.tick();
		if (!(this.level() instanceof ServerLevel)) {
			this.previousTreePitch = this.treePitch;
			boolean inverted = this.treePoseDirection() == UNDER_LEAVES;
			this.previousTreeRoll = this.treeRoll;
			this.treeRoll = Mth.approach(this.treeRoll, inverted ? 180.0F : 0.0F, 30.0F);
			float target = inverted ? 0 : this.treePoseDirection() * TREE_PITCH_DEGREES;
			this.treePitch = Mth.approach(this.treePitch, target, 19.5F);
		}
	}

	/** Interpolated upward or downward trunk-cling pitch for the model, in degrees. */
	public float treePosePitch(float partialTick) {
		return Mth.lerp(Mth.clamp(partialTick, 0.0F, 1.0F), this.previousTreePitch, this.treePitch);
	}

	/** Roll around the direction of travel while crossing the underside of foliage. */
	public float treePoseRoll(float partialTick) {
		return Mth.lerp(Mth.clamp(partialTick, 0.0F, 1.0F), this.previousTreeRoll, this.treeRoll);
	}

	void poseUnderLeaves(double x, double z) {
		this.entityData.set(TREE_POSE, UNDER_LEAVES);
		this.faceDirection(x, z);
	}

	int treePoseDirection() {
		return this.entityData.get(TREE_POSE);
	}

	void clearTreePose() {
		this.entityData.set(TREE_POSE, (byte) 0);
	}

	void poseAgainstTrunk(BlockPos trunk, boolean descending) {
		this.entityData.set(TREE_POSE, (byte) (descending ? -1 : 1));
		double x = trunk.getX() + 0.5D - this.getX();
		double z = trunk.getZ() + 0.5D - this.getZ();
		this.faceDirection(x, z);
	}

	private void faceDirection(double x, double z) {
		float yaw = (float) Math.toDegrees(Mth.atan2(-x, z));
		this.setYRot(yaw);
		this.setYBodyRot(yaw);
	}

	/** Attributes tuned so a squirrel can stay just ahead of Mushroom during a playful chase. */
	public static AttributeSupplier.Builder createAttributes() {
		return SquirrelAttributes.create();
	}

	@Override
	protected PathNavigation createNavigation(Level level) {
		// The tree goal owns wall contact. Spider navigation's fallback aims at
		// an integer trunk corner and can steer us away from the selected face.
		return new GroundPathNavigation(this, level);
	}

	@Override
	protected void registerGoals() {
		this.goalSelector.addGoal(0, new FloatGoal(this));
		this.goalSelector.addGoal(1, new SquirrelSaplingGoal(this));
		this.goalSelector.addGoal(2, new SquirrelFindTreeGoal(this));
		this.goalSelector.addGoal(3, new AvoidEntityGoal<>(this, MushroomYorkieEntity.class, 10.0F, 1.2D, 1.45D));
		this.goalSelector.addGoal(4, new BreedGoal(this, 1.0D));
		this.goalSelector.addGoal(5, new TemptGoal(this, 1.1D, Ingredient.of(Items.SWEET_BERRIES, Items.WHEAT_SEEDS), false));
		this.goalSelector.addGoal(6, new RandomStrollGoal(this, 1.0D, 80));
		this.goalSelector.addGoal(7, new LookAtPlayerGoal(this, Player.class, 6.0F));
		this.goalSelector.addGoal(8, new RandomLookAroundGoal(this));
	}

	/** True once this squirrel has climbed to the safe height on its selected tree. */
	public boolean hasFoundTree() {
		return this.foundTree;
	}

	void setFoundTree(boolean foundTree) {
		this.foundTree = foundTree;
	}

	void setTreeClimbing(boolean treeClimbing) {
		this.treeClimbing = treeClimbing;
		if (!treeClimbing) {
			this.clearTreePose();
		}
	}

	@Override
	public boolean onClimbable() {
		return this.treeClimbing || super.onClimbable();
	}

	@Override
	public boolean isFood(ItemStack stack) {
		return stack.is(Items.SWEET_BERRIES) || stack.is(Items.WHEAT_SEEDS);
	}

	@Override
	public AgeableMob getBreedOffspring(ServerLevel level, AgeableMob partner) {
		return new SquirrelEntity(ModEntities.SQUIRREL, level);
	}
}
