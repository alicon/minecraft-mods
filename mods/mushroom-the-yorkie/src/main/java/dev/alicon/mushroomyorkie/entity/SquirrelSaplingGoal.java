package dev.alicon.mushroomyorkie.entity;

import java.util.Comparator;
import java.util.EnumSet;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.tags.BlockTags;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.block.SaplingBlock;
import net.minecraft.world.phys.Vec3;

final class SquirrelSaplingGoal extends Goal {
	private static final int SEARCH_INTERVAL_TICKS = 40;
	private static final int TASK_TIMEOUT_TICKS = 160;
	private static final int ITEM_SEARCH_RADIUS = 8;
	private static final int PLANTING_RADIUS = 4;
	private static final double REACH_DISTANCE_SQR = 1.0D;
	private final SquirrelEntity squirrel;
	private ItemEntity source;
	private BlockPos plantingSpot;
	private long nextSearch;
	private long deadline;
	private long nextMove;

	SquirrelSaplingGoal(SquirrelEntity squirrel) {
		this.squirrel = squirrel;
		this.setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK));
	}

	@Override
	public boolean canUse() {
		if (!(this.squirrel.level() instanceof ServerLevel level) || !this.squirrel.onGround()
				|| this.squirrel.hurtTime > 0 || level.getGameTime() < this.nextSearch || !SquirrelMobGriefing.canPlant(level)) {
			return false;
		}
		this.nextSearch = level.getGameTime() + SEARCH_INTERVAL_TICKS;
		if (sapling(this.squirrel.getMainHandItem()) != null) {
			this.plantingSpot = this.findPlantingSpot(level, this.squirrel.blockPosition(), sapling(this.squirrel.getMainHandItem()));
			if (this.plantingSpot != null) return true;
			this.dropCarried(level);
			return false;
		}
		this.source = level.getEntitiesOfClass(ItemEntity.class, this.squirrel.getBoundingBox().inflate(ITEM_SEARCH_RADIUS, 2, ITEM_SEARCH_RADIUS),
				item -> item.isAlive() && !item.hasPickUpDelay() && sapling(item.getItem()) != null)
				.stream().min(Comparator.comparingDouble(this.squirrel::distanceToSqr)).orElse(null);
		if (this.source == null) return false;
		this.plantingSpot = this.findPlantingSpot(level, this.source.blockPosition(), sapling(this.source.getItem()));
		return this.plantingSpot != null;
	}

	@Override
	public boolean canContinueToUse() {
		return this.squirrel.level() instanceof ServerLevel level && SquirrelMobGriefing.canPlant(level)
				&& this.squirrel.hurtTime <= 0 && level.getGameTime() < this.deadline && this.plantingSpot != null
				&& (sapling(this.squirrel.getMainHandItem()) != null || this.source != null && this.source.isAlive());
	}

	@Override
	public void start() {
		this.deadline = this.squirrel.level().getGameTime() + TASK_TIMEOUT_TICKS;
		this.nextMove = 0;
	}

	@Override
	public void stop() {
		if (this.squirrel.isAlive() && this.squirrel.level() instanceof ServerLevel level) this.dropCarried(level);
		this.source = null;
		this.plantingSpot = null;
		this.squirrel.getNavigation().stop();
	}

	@Override
	public void tick() {
		if (!(this.squirrel.level() instanceof ServerLevel level) || this.plantingSpot == null) return;
		SaplingBlock carried = sapling(this.squirrel.getMainHandItem());
		if (carried == null) {
			this.collect(level);
			return;
		}
		if (!canPlantAt(level, this.plantingSpot, carried)) {
			this.plantingSpot = this.findPlantingSpot(level, this.squirrel.blockPosition(), carried);
			return;
		}
		Vec3 target = Vec3.atBottomCenterOf(this.plantingSpot);
		if (this.squirrel.distanceToSqr(target) <= REACH_DISTANCE_SQR) {
			if (level.setBlockAndUpdate(this.plantingSpot, carried.defaultBlockState())) {
				this.squirrel.setItemSlot(EquipmentSlot.MAINHAND, ItemStack.EMPTY);
				level.playSound(null, this.plantingSpot, SoundEvents.GRASS_PLACE, SoundSource.NEUTRAL, 0.45F, 1.3F);
				this.plantingSpot = null;
			}
		} else {
			this.moveTo(level, target);
		}
	}

	private void collect(ServerLevel level) {
		if (this.source == null || !this.source.isAlive() || sapling(this.source.getItem()) == null) return;
		if (this.squirrel.distanceToSqr(this.source) > REACH_DISTANCE_SQR) {
			this.moveTo(level, this.source.position());
			return;
		}
		ItemStack stack = this.source.getItem();
		this.squirrel.setItemSlot(EquipmentSlot.MAINHAND, stack.copyWithCount(1));
		this.squirrel.setDropChance(EquipmentSlot.MAINHAND, 2.0F);
		if (stack.getCount() == 1) this.source.discard();
		else this.source.setItem(stack.copyWithCount(stack.getCount() - 1));
		this.source = null;
		this.nextMove = 0;
	}

	private void moveTo(ServerLevel level, Vec3 target) {
		if (level.getGameTime() < this.nextMove) return;
		this.nextMove = level.getGameTime() + 10;
		this.squirrel.getLookControl().setLookAt(target);
		var navigation = this.squirrel.getNavigation();
		BlockPos block = BlockPos.containing(target);
		var path = navigation.createPath(block, 0);
		if (path != null && path.canReach() && path.getTarget().equals(block)) navigation.moveTo(path, 0.9D);
	}

	private BlockPos findPlantingSpot(ServerLevel level, BlockPos center, SaplingBlock sapling) {
		// Start away from the item so the animal visibly carries it to the planting spot.
		BlockPos best = null;
		double bestDistance = Double.MAX_VALUE;
		for (BlockPos candidate : BlockPos.betweenClosed(center.offset(-PLANTING_RADIUS, -1, -PLANTING_RADIUS), center.offset(PLANTING_RADIUS, 1, PLANTING_RADIUS))) {
			double distance = center.distSqr(candidate);
			if (distance >= 4.0D && distance < bestDistance && canPlantAt(level, candidate, sapling)) {
				best = candidate.immutable();
				bestDistance = distance;
			}
		}
		return best;
	}

	private static boolean canPlantAt(ServerLevel level, BlockPos position, SaplingBlock sapling) {
		return level.hasChunkAt(position) && level.getWorldBorder().isWithinBounds(position)
				&& level.getBlockState(position).isAir() && level.getBlockState(position.below()).is(BlockTags.DIRT)
				&& level.canSeeSky(position.above()) && sapling.defaultBlockState().canSurvive(level, position);
	}

	private static SaplingBlock sapling(ItemStack stack) {
		return !stack.isEmpty() && stack.getItem() instanceof BlockItem item && item.getBlock() instanceof SaplingBlock plant ? plant : null;
	}

	private void dropCarried(ServerLevel level) {
		ItemStack stack = this.squirrel.getMainHandItem();
		if (sapling(stack) == null) return;
		ItemEntity returned = new ItemEntity(level, this.squirrel.getX(), this.squirrel.getY(), this.squirrel.getZ(), stack);
		returned.setDefaultPickUpDelay();
		if (level.addFreshEntity(returned)) this.squirrel.setItemSlot(EquipmentSlot.MAINHAND, ItemStack.EMPTY);
	}
}
