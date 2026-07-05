package dev.alicon.mushroomyorkie.entity;

import java.util.Comparator;
import java.util.EnumSet;
import java.util.List;
import java.util.UUID;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.tags.FluidTags;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.entity.EntityTypeTest;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

final class FetchBallGoal extends Goal {
	private static final int SEARCH_COOLDOWN_TICKS = 20;
	private static final int RETURN_COOLDOWN_TICKS = 40;
	private static final int MOVE_RETRY_TICKS = 22;
	private static final double SEARCH_RADIUS = 32.0D;
	private static final double PICKUP_HORIZONTAL_DISTANCE_SQR = 3.24D;
	private static final double PICKUP_VERTICAL_DISTANCE = 2.0D;
	private static final double RETURN_DISTANCE_SQR = 4.0D;
	private static final double MAX_SURVIVAL_FETCH_DROP = 3.0D;
	private static final double FETCH_SPEED = 1.45D;
	private static final double RETURN_SPEED = 1.35D;
	private static final int UNSAFE_FETCH_BARK_TICKS = 20 * 2;
	private static final int UNREACHABLE_FETCH_TICKS = 20;
	private static final int WATER_SURFACE_SCAN_BLOCKS = 10;
	private static final double MOVE_TARGET_REFRESH_DISTANCE_SQR = 4.0D;

	private final MushroomYorkieEntity yorkie;
	private ItemEntity toy;
	private ItemStack carriedToy = ItemStack.EMPTY;
	private UUID lastReturnedToy;
	private long nextSearchGameTime;
	private int nextMoveTick;
	private int unsafeFetchBarkTicks;
	private int unreachableTicks;
	private Vec3 lastMoveTarget;
	private Vec3 unsafeFetchLookTarget;
	private boolean carrying;
	private boolean completed;

	FetchBallGoal(MushroomYorkieEntity yorkie) {
		this.yorkie = yorkie;
		this.setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK));
	}

	@Override
	public boolean canUse() {
		if (!(this.yorkie.level() instanceof ServerLevel level) || !(this.yorkie.getOwner() instanceof Player owner) || !this.canFetch(owner)) {
			return false;
		}

		if (level.getGameTime() < this.nextSearchGameTime) {
			return false;
		}
		this.nextSearchGameTime = level.getGameTime() + SEARCH_COOLDOWN_TICKS;

		this.toy = this.findToy(level, owner);
		return this.toy != null;
	}

	@Override
	public boolean canContinueToUse() {
		return !this.completed
				&& this.yorkie.getOwner() instanceof Player owner
				&& this.canFetch(owner)
				&& (this.carrying || (this.toy != null && !this.toy.isRemoved()));
	}

	@Override
	public boolean requiresUpdateEveryTick() {
		return true;
	}

	@Override
	public void start() {
		this.nextMoveTick = 0;
		this.carrying = false;
		this.completed = false;
		this.carriedToy = ItemStack.EMPTY;
		this.lastMoveTarget = null;
		this.unreachableTicks = 0;
		MushroomBehaviorDebugger.debug(this.yorkie, "fetch_start", "fetch: chasing a toy", true);
	}

	@Override
	public void stop() {
		this.toy = null;
		this.carrying = false;
		this.carriedToy = ItemStack.EMPTY;
		this.completed = false;
		this.lastMoveTarget = null;
		this.unreachableTicks = 0;
	}

	@Override
	public void tick() {
		if (!(this.yorkie.level() instanceof ServerLevel level) || !(this.yorkie.getOwner() instanceof Player owner)) {
			this.completed = true;
			return;
		}

		if (this.unsafeFetchBarkTicks > 0) {
			this.tickUnsafeFetchBark();
			return;
		}

		if (this.carrying) {
			this.returnToOwner(level, owner);
			return;
		}

		if (this.toy == null || this.toy.isRemoved()) {
			this.completed = true;
			return;
		}

		if (!this.safeFetchPlacement(level, owner, this.toy)) {
			this.abortUnsafeFetch(level, owner, this.toy);
			return;
		}

		this.yorkie.getLookControl().setLookAt(this.toy, 10.0F, this.yorkie.getMaxHeadXRot());
		if (this.canPickUpToy(this.toy)) {
			this.pickUpToy();
			this.toy = null;
			this.carrying = true;
			this.nextMoveTick = 0;
			this.yorkie.bark();
			MushroomBehaviorDebugger.debug(this.yorkie, "fetch_pickup", "fetch: picked up the toy", true);
			return;
		}

		this.moveToward(this.fetchMoveTarget(this.toy), FETCH_SPEED);
		if (this.fetchLooksUnreachable(level, this.toy)) {
			this.abortUnreachableFetch(level, this.toy);
		}
	}

	private boolean canFetch(Player owner) {
		return this.yorkie.isTame()
				&& owner.level() == this.yorkie.level()
				&& !this.yorkie.isOrderedToSit()
				&& !this.yorkie.isMushroomSleeping()
				&& this.yorkie.scaredRunTicks <= 0;
	}

	private ItemEntity findToy(ServerLevel level, Player owner) {
		AABB area = this.yorkie.getBoundingBox().inflate(SEARCH_RADIUS, 8.0D, SEARCH_RADIUS);
		List<ItemEntity> toys = level.getEntities(
				EntityTypeTest.forClass(ItemEntity.class),
				area,
				item -> MushroomFetchToyPolicy.isFetchToy(item.getItem()) && !this.isLastReturnedToy(item)
		);
		return toys.stream()
				.filter(item -> this.safeFetchPlacement(level, owner, item))
				.min(Comparator.comparingDouble(this.yorkie::distanceToSqr))
				.orElseGet(() -> toys.stream().min(Comparator.comparingDouble(this.yorkie::distanceToSqr)).orElse(null));
	}

	private boolean canPickUpToy(ItemEntity item) {
		Vec3 delta = item.position().subtract(this.yorkie.position());
		return delta.horizontalDistanceSqr() <= PICKUP_HORIZONTAL_DISTANCE_SQR && Math.abs(delta.y) <= PICKUP_VERTICAL_DISTANCE;
	}

	private boolean fetchLooksUnreachable(ServerLevel level, ItemEntity item) {
		if (this.yorkie.ownerIsCreativeFlying() || this.canPickUpToy(item) || !this.yorkie.getNavigation().isDone()) {
			this.unreachableTicks = 0;
			return false;
		}

		this.unreachableTicks++;
		return this.unreachableTicks >= UNREACHABLE_FETCH_TICKS && level.getGameTime() >= this.nextSearchGameTime;
	}

	private Vec3 fetchMoveTarget(ItemEntity item) {
		if (this.yorkie.ownerIsCreativeFlying()) {
			return item.position();
		}

		double y = item.getY();
		if (Math.abs(y - this.yorkie.getY()) > PICKUP_VERTICAL_DISTANCE) {
			y = this.yorkie.getY();
		}
		return new Vec3(item.getX(), y, item.getZ());
	}

	private void pickUpToy() {
		ItemStack stack = this.toy.getItem();
		this.carriedToy = stack.copyWithCount(1);
		stack.shrink(1);
		if (stack.isEmpty()) {
			this.toy.discard();
		} else {
			this.toy.setItem(stack);
		}
	}

	private boolean isLastReturnedToy(ItemEntity item) {
		return this.lastReturnedToy != null && this.lastReturnedToy.equals(item.getUUID());
	}

	private void abortUnsafeFetch(ServerLevel level, Player owner, ItemEntity item) {
		this.nextSearchGameTime = level.getGameTime() + RETURN_COOLDOWN_TICKS;
		this.unsafeFetchBarkTicks = UNSAFE_FETCH_BARK_TICKS;
		this.unsafeFetchLookTarget = item.position();
		this.yorkie.getNavigation().stop();
		if (!this.safeSurvivalDrop(owner, item)) {
			MushroomBehaviorDebugger.debug(this.yorkie, "fetch_drop_unsafe", "fetch: toy is too far below for survival cliff safety", true);
		} else {
			MushroomBehaviorDebugger.debug(this.yorkie, "fetch_water_unsafe", "fetch: skipping wet toy without breathing room", true);
		}
	}

	private void abortUnreachableFetch(ServerLevel level, ItemEntity item) {
		this.nextSearchGameTime = level.getGameTime() + RETURN_COOLDOWN_TICKS;
		this.unsafeFetchBarkTicks = UNSAFE_FETCH_BARK_TICKS;
		this.unsafeFetchLookTarget = item.position();
		this.unreachableTicks = 0;
		this.yorkie.getNavigation().stop();
		MushroomBehaviorDebugger.debug(this.yorkie, "fetch_unreachable", "fetch: toy is not reachable from this edge", true);
	}

	private void tickUnsafeFetchBark() {
		if (this.unsafeFetchLookTarget != null) {
			this.yorkie.getLookControl().setLookAt(this.unsafeFetchLookTarget.x, this.unsafeFetchLookTarget.y, this.unsafeFetchLookTarget.z);
		}
		if (this.unsafeFetchBarkTicks % 20 == 0) {
			this.yorkie.bark();
		}
		this.unsafeFetchBarkTicks--;
		if (this.unsafeFetchBarkTicks <= 0) {
			this.completed = true;
			this.unsafeFetchLookTarget = null;
		}
	}

	private boolean safeFetchPlacement(ServerLevel level, Player owner, ItemEntity item) {
		return this.safeSurvivalDrop(owner, item) && safeWaterPlacement(level, item);
	}

	private boolean safeSurvivalDrop(Player owner, ItemEntity item) {
		return owner.isCreative() || this.yorkie.getY() - item.getY() <= MAX_SURVIVAL_FETCH_DROP;
	}

	private static boolean safeWaterPlacement(ServerLevel level, ItemEntity item) {
		BlockPos pos = item.blockPosition();
		boolean waterHere = level.getFluidState(pos).is(FluidTags.WATER);
		boolean waterBelow = level.getFluidState(pos.below()).is(FluidTags.WATER);
		if (!waterHere && !waterBelow) {
			return true;
		}

		for (int offset = 0; offset <= WATER_SURFACE_SCAN_BLOCKS; offset++) {
			BlockPos breathPos = pos.above(offset);
			if (level.getFluidState(breathPos).is(FluidTags.WATER)) {
				continue;
			}
			return level.isEmptyBlock(breathPos);
		}
		return false;
	}

	private void returnToOwner(ServerLevel level, Player owner) {
		this.yorkie.getLookControl().setLookAt(owner, 10.0F, this.yorkie.getMaxHeadXRot());
		if (this.yorkie.distanceToSqr(owner) <= RETURN_DISTANCE_SQR) {
			ItemStack returnedStack = this.carriedToy.isEmpty() ? ItemStack.EMPTY : this.carriedToy.copyWithCount(1);
			this.returnToy(level, owner, returnedStack);
			this.yorkie.needs.playWithToy();
			this.yorkie.bark();
			MushroomBehaviorDebugger.debug(this.yorkie, "fetch_return", "fetch: brought the toy back", true);
			this.nextSearchGameTime = level.getGameTime() + RETURN_COOLDOWN_TICKS;
			this.completed = true;
			return;
		}

		this.moveToward(owner.position(), RETURN_SPEED);
	}

	private void returnToy(ServerLevel level, Player owner, ItemStack returnedStack) {
		if (returnedStack.isEmpty() || owner.isCreative()) {
			return;
		}

		if (owner.addItem(returnedStack)) {
			return;
		}

		ItemEntity returned = new ItemEntity(level, owner.getX(), owner.getY() + 0.2D, owner.getZ(), returnedStack);
		returned.setPickUpDelay(20);
		returned.setThrower(this.yorkie);
		level.addFreshEntity(returned);
		this.lastReturnedToy = returned.getUUID();
	}

	private void moveToward(Vec3 target, double speed) {
		boolean targetShifted = this.lastMoveTarget == null || this.lastMoveTarget.distanceToSqr(target) > MOVE_TARGET_REFRESH_DISTANCE_SQR;
		if (!targetShifted && this.nextMoveTick-- > 0) {
			return;
		}

		this.yorkie.getNavigation().moveTo(target.x, target.y, target.z, speed);
		this.lastMoveTarget = target;
		this.nextMoveTick = MOVE_RETRY_TICKS;
	}
}
