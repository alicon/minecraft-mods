package dev.alicon.mushroomyorkie.entity;

import java.util.EnumSet;
import java.util.UUID;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.phys.Vec3;

final class FetchBallGoal extends Goal {
	private static final int SEARCH_COOLDOWN_TICKS = 20;
	private static final int RETURN_COOLDOWN_TICKS = 40;
	private static final int MAX_FETCH_CHASE_TICKS = 20 * 35;
	private static final double FETCH_SPEED = 1.30D;
	private static final int UNSAFE_FETCH_BARK_TICKS = 20 * 2;
	private static final int UNREACHABLE_FETCH_TICKS = 20 * 4;

	private final MushroomYorkieEntity yorkie;
	private final FetchToyMovement movement;
	private final FetchToyReturner returner;
	private ItemEntity toy;
	private ItemStack carriedToy = ItemStack.EMPTY;
	private UUID lastReturnedToy;
	private UUID ignoredToy;
	private long nextSearchGameTime;
	private int unsafeFetchBarkTicks;
	private int unreachableTicks;
	private int fetchChaseTicks;
	private Vec3 unsafeFetchLookTarget;
	private boolean carrying;
	private boolean completed;

	FetchBallGoal(MushroomYorkieEntity yorkie) {
		this.yorkie = yorkie;
		this.movement = new FetchToyMovement(yorkie);
		this.returner = new FetchToyReturner(yorkie);
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

		this.toy = FetchToyChase.findNearestFetchToy(level, this.yorkie, owner, this.lastReturnedToy, this.ignoredToy);
		if (this.toy != null) {
			this.yorkie.creativeRecoveryFlight.block();
		}
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
		this.movement.reset();
		this.returner.reset();
		this.carrying = false;
		this.completed = false;
		this.carriedToy = ItemStack.EMPTY;
		this.unreachableTicks = 0;
		this.fetchChaseTicks = 0;
		this.yorkie.creativeRecoveryFlight.block();
		MushroomBehaviorDebugger.debug(this.yorkie, "fetch_start", "fetch: chasing a toy", true);
	}

	@Override
	public void stop() {
		this.toy = null;
		this.carrying = false;
		this.carriedToy = ItemStack.EMPTY;
		this.completed = false;
		this.movement.reset();
		this.returner.reset();
		this.unreachableTicks = 0;
		this.fetchChaseTicks = 0;
	}

	@Override
	public void tick() {
		if (!(this.yorkie.level() instanceof ServerLevel level) || !(this.yorkie.getOwner() instanceof Player owner)) {
			this.completed = true;
			return;
		}

		if (this.unsafeFetchBarkTicks > 0) {
			this.yorkie.creativeRecoveryFlight.block();
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

		this.yorkie.creativeRecoveryFlight.block();
		this.fetchChaseTicks++;
		if (this.fetchChaseTicks >= MAX_FETCH_CHASE_TICKS) {
			this.abortTimedOutFetch(level, this.toy);
			return;
		}

		if (!FetchToySafety.safeFetchPlacement(level, owner, this.yorkie, this.toy)) {
			this.abortUnsafeFetch(level, owner, this.toy);
			return;
		}

		this.yorkie.getLookControl().setLookAt(this.toy, 10.0F, this.yorkie.getMaxHeadXRot());
		if (FetchToyChase.canPickUp(this.yorkie, this.toy)) {
			this.carriedToy = FetchToyChase.pickUp(this.toy);
			this.toy = null;
			this.carrying = true;
			this.movement.retryNow();
			this.returner.reset();
			MushroomYorkieSounds.bark(this.yorkie);
			MushroomBehaviorDebugger.debug(this.yorkie, "fetch_pickup", "fetch: picked up the toy", true);
			return;
		}

		this.movement.moveToward(FetchToyChase.moveTarget(level, this.yorkie, this.toy), FETCH_SPEED);
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

	private boolean fetchLooksUnreachable(ServerLevel level, ItemEntity item) {
		if (MushroomYorkieStateQueries.ownerIsCreativeFlying(this.yorkie) || FetchToyChase.canPickUp(this.yorkie, item) || !this.yorkie.getNavigation().isDone()) {
			this.unreachableTicks = 0;
			return false;
		}

		this.unreachableTicks++;
		return this.unreachableTicks >= UNREACHABLE_FETCH_TICKS && level.getGameTime() >= this.nextSearchGameTime;
	}

	private void ignoreToy(ItemEntity item) {
		this.ignoredToy = item.getUUID();
	}

	private void abortUnsafeFetch(ServerLevel level, Player owner, ItemEntity item) {
		String debugKey;
		String debugMessage;
		if (!FetchToySafety.safeSurvivalDrop(owner, this.yorkie, item)) {
			debugKey = "fetch_drop_unsafe";
			debugMessage = "fetch: toy is too far below for survival cliff safety";
		} else {
			debugKey = "fetch_water_unsafe";
			debugMessage = "fetch: skipping wet toy without breathing room";
		}
		this.abortFetch(level, item, "message.mushroom_yorkie.notice_fetch_tricky", debugKey, debugMessage);
	}

	private void abortUnreachableFetch(ServerLevel level, ItemEntity item) {
		this.unreachableTicks = 0;
		this.abortFetch(
				level,
				item,
				"message.mushroom_yorkie.notice_fetch_unreachable",
				"fetch_unreachable",
				"fetch: toy is not reachable from this edge"
		);
	}

	private void abortTimedOutFetch(ServerLevel level, ItemEntity item) {
		this.unreachableTicks = 0;
		this.abortFetch(
				level,
				item,
				"message.mushroom_yorkie.notice_fetch_unreachable",
				"fetch_timeout",
				"fetch: gave up after chasing the toy too long"
		);
	}

	private void abortFetch(ServerLevel level, ItemEntity item, String noticeKey, String debugKey, String debugMessage) {
		this.nextSearchGameTime = level.getGameTime() + RETURN_COOLDOWN_TICKS;
		this.unsafeFetchBarkTicks = UNSAFE_FETCH_BARK_TICKS;
		this.unsafeFetchLookTarget = item.position();
		this.ignoreToy(item);
		this.yorkie.getNavigation().stop();
		MushroomOwnerNotice.send(this.yorkie, noticeKey, MushroomOwnerNotice.SHORT_COOLDOWN_TICKS);
		MushroomBehaviorDebugger.debug(this.yorkie, debugKey, debugMessage, true);
	}

	private void tickUnsafeFetchBark() {
		if (this.unsafeFetchLookTarget != null) {
			this.yorkie.getLookControl().setLookAt(this.unsafeFetchLookTarget.x, this.unsafeFetchLookTarget.y, this.unsafeFetchLookTarget.z);
		}
		if (this.unsafeFetchBarkTicks % 20 == 0) {
			MushroomYorkieSounds.bark(this.yorkie);
		}
		this.unsafeFetchBarkTicks--;
		if (this.unsafeFetchBarkTicks <= 0) {
			this.completed = true;
			this.unsafeFetchLookTarget = null;
		}
	}

	private void returnToOwner(ServerLevel level, Player owner) {
		FetchToyReturnResult result = this.returner.tick(level, owner, this.carriedToy, this.movement);
		if (!result.completed()) {
			return;
		}

		if (result.returnedToy() != null) {
			this.lastReturnedToy = result.returnedToy();
		}
		this.nextSearchGameTime = level.getGameTime() + RETURN_COOLDOWN_TICKS;
		this.carrying = false;
		this.carriedToy = ItemStack.EMPTY;
		this.completed = true;
	}
}
