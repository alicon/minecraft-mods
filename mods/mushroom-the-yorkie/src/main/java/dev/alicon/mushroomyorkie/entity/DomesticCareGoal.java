package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.block.ModBlocks;
import java.util.EnumSet;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.phys.Vec3;

final class DomesticCareGoal extends Goal {
	private static final int SEARCH_COOLDOWN_TICKS = 80;
	private static final int MOVE_RETRY_TICKS = 30;
	private static final double USE_DISTANCE_SQR = 2.25D;

	private final MushroomYorkieEntity yorkie;
	private BlockPos targetPos;
	private BowlUse targetUse;
	private long nextSearchGameTime;
	private int nextMoveTick;
	private boolean completed;

	DomesticCareGoal(MushroomYorkieEntity yorkie) {
		this.yorkie = yorkie;
		this.setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK));
	}

	@Override
	public boolean canUse() {
		if (!(this.yorkie.level() instanceof ServerLevel level) || !this.canUseDomesticCare(level)) {
			return false;
		}

		if (level.getGameTime() < this.nextSearchGameTime) {
			return false;
		}
		this.nextSearchGameTime = level.getGameTime() + SEARCH_COOLDOWN_TICKS;

		long day = MushroomYorkieEntity.currentDay(level);
		if (this.yorkie.domestic.canEatFoodBowl(day, this.yorkie.needs.hunger())) {
			BlockPos foodBowl = MushroomDomesticLocator.findNearestFoodBowl(level, this.yorkie.blockPosition());
			if (foodBowl != null) {
				this.targetPos = foodBowl;
				this.targetUse = BowlUse.FOOD;
				return true;
			}
		}

		if (this.yorkie.domestic.canDrinkWaterBowl(day)) {
			BlockPos waterBowl = MushroomDomesticLocator.findNearestWaterBowl(level, this.yorkie.blockPosition());
			if (waterBowl != null) {
				this.targetPos = waterBowl;
				this.targetUse = BowlUse.WATER;
				return true;
			}
		}

		return false;
	}

	@Override
	public boolean canContinueToUse() {
		return !this.completed
				&& this.targetPos != null
				&& this.targetUse != null
				&& this.yorkie.level() instanceof ServerLevel level
				&& this.canUseDomesticCare(level)
				&& this.targetUse.isStillAvailable(level, this.targetPos);
	}

	@Override
	public boolean requiresUpdateEveryTick() {
		return true;
	}

	@Override
	public void start() {
		this.nextMoveTick = 0;
		this.completed = false;
		MushroomBehaviorDebugger.debug(this.yorkie, "domestic_bowl_start", "domestic care: heading to " + this.targetUse.debugName, true);
	}

	@Override
	public void stop() {
		this.targetPos = null;
		this.targetUse = null;
		this.completed = false;
	}

	@Override
	public void tick() {
		if (!(this.yorkie.level() instanceof ServerLevel level) || this.targetPos == null || this.targetUse == null) {
			this.completed = true;
			return;
		}

		Vec3 target = Vec3.atBottomCenterOf(this.targetPos);
		this.yorkie.getLookControl().setLookAt(target.x, target.y, target.z);
		if (this.yorkie.distanceToSqr(target) <= USE_DISTANCE_SQR) {
			this.consumeBowl(level);
			this.completed = true;
			return;
		}

		if (this.nextMoveTick-- > 0 && !this.yorkie.getNavigation().isDone()) {
			return;
		}

		this.yorkie.getNavigation().moveTo(target.x, target.y, target.z, 1.0D);
		this.nextMoveTick = MOVE_RETRY_TICKS;
	}

	private boolean canUseDomesticCare(ServerLevel level) {
		LivingEntity owner = this.yorkie.getOwner();
		return this.yorkie.isTame()
				&& owner instanceof Player
				&& owner.level() == this.yorkie.level()
				&& !this.yorkie.isOrderedToSit()
				&& !this.yorkie.isMushroomSleeping()
				&& this.yorkie.scaredRunTicks <= 0
				&& !this.yorkie.wasScoldedToday(level);
	}

	private void consumeBowl(ServerLevel level) {
		long day = MushroomYorkieEntity.currentDay(level);
		level.setBlockAndUpdate(this.targetPos, ModBlocks.DOG_BOWL.defaultBlockState());
		if (this.targetUse == BowlUse.FOOD) {
			this.yorkie.domestic.recordFoodBowl(day);
			this.yorkie.needs.eatMeal();
			this.yorkie.heal(2.0F);
			this.yorkie.playSound(SoundEvents.EXPERIENCE_ORB_PICKUP, 0.5F, 1.2F);
		} else {
			this.yorkie.domestic.recordWaterBowl(day);
			this.yorkie.needs.drinkWater();
			this.yorkie.playSound(SoundEvents.BUCKET_EMPTY, 0.35F, 1.7F);
		}

		level.sendParticles(ParticleTypes.HEART, this.yorkie.getX(), this.yorkie.getY() + 0.5D, this.yorkie.getZ(), 3, 0.2D, 0.15D, 0.2D, 0.0D);
		MushroomBehaviorDebugger.debug(this.yorkie, "domestic_bowl_used", "domestic care: finished " + this.targetUse.debugName, true);
	}

	private enum BowlUse {
		FOOD("food", ModBlocks.DOG_FOOD_BOWL),
		WATER("water", ModBlocks.DOG_WATER_BOWL);

		private final String debugName;
		private final net.minecraft.world.level.block.Block block;

		BowlUse(String debugName, net.minecraft.world.level.block.Block block) {
			this.debugName = debugName;
			this.block = block;
		}

		private boolean isStillAvailable(ServerLevel level, BlockPos pos) {
			return level.getBlockState(pos).is(this.block);
		}
	}
}
