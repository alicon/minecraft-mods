package dev.alicon.mushroomyorkie.entity;

import net.minecraft.server.level.ServerLevel;
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
import net.minecraft.world.entity.ai.navigation.PathNavigation;
import net.minecraft.world.entity.ai.navigation.WallClimberNavigation;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.crafting.Ingredient;
import net.minecraft.world.level.Level;

/** Small woodland squirrel whose first instinct is always to find a nearby tree. */
public final class SquirrelEntity extends net.minecraft.world.entity.animal.Animal {
	private boolean foundTree;
	private boolean treeClimbing;

	/** Creates a squirrel in the supplied world. */
	public SquirrelEntity(EntityType<? extends SquirrelEntity> entityType, Level level) {
		super(entityType, level);
	}

	/** Attributes tuned so a squirrel can stay just ahead of Mushroom during a playful chase. */
	public static AttributeSupplier.Builder createAttributes() {
		return SquirrelAttributes.create();
	}

	@Override
	protected PathNavigation createNavigation(Level level) {
		return new WallClimberNavigation(this, level);
	}

	@Override
	protected void registerGoals() {
		this.goalSelector.addGoal(0, new FloatGoal(this));
		this.goalSelector.addGoal(1, new SquirrelFindTreeGoal(this));
		this.goalSelector.addGoal(2, new AvoidEntityGoal<>(this, MushroomYorkieEntity.class, 10.0F, 1.2D, 1.45D));
		this.goalSelector.addGoal(3, new BreedGoal(this, 1.0D));
		this.goalSelector.addGoal(4, new TemptGoal(this, 1.1D, Ingredient.of(Items.SWEET_BERRIES, Items.WHEAT_SEEDS), false));
		this.goalSelector.addGoal(5, new RandomStrollGoal(this, 1.0D, 80));
		this.goalSelector.addGoal(6, new LookAtPlayerGoal(this, Player.class, 6.0F));
		this.goalSelector.addGoal(7, new RandomLookAroundGoal(this));
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
