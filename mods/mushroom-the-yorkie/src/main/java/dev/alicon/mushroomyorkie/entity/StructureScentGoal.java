package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.MushroomStructureScentConfig;
import dev.alicon.mushroomyorkie.MushroomTheYorkie;
import java.util.EnumSet;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.entity.player.Player;

final class StructureScentGoal extends Goal {
	private static final int CELEBRATE_TICKS = 80;

	private final MushroomYorkieEntity yorkie;
	private final StructureScentNotifier notifier;
	private final StructureScentMovement movement;
	private final StructureScentTrailConfidence trailConfidence;
	private MushroomStructureScentConfig config;
	private StructureScent scent;
	private long nextSearchGameTime;
	private int nextCircleBackTick;
	private int circleBackTicks;
	private int celebrateTicks;
	private boolean completed;

	StructureScentGoal(MushroomYorkieEntity yorkie) {
		this.yorkie = yorkie;
		this.notifier = new StructureScentNotifier(yorkie);
		this.movement = new StructureScentMovement(yorkie);
		this.trailConfidence = new StructureScentTrailConfidence();
		this.setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK));
	}

	@Override
	public boolean canUse() {
		if (!(this.yorkie.level() instanceof ServerLevel level)) {
			return false;
		}

		this.config = MushroomTheYorkie.structureScentConfig();
		if (!StructureScentEligibility.canSniff(level, this.yorkie, this.config) || level.getGameTime() < this.nextSearchGameTime) {
			return false;
		}

		this.nextSearchGameTime = level.getGameTime() + this.config.cooldownTicks();
		this.scent = StructureScentLocator.findNearest(level, this.yorkie.blockPosition(), this.config).orElse(null);
		return this.scent != null && !(this.yorkie.getOwner() instanceof Player owner && this.hasArrived(level, owner));
	}

	@Override
	public boolean canContinueToUse() {
		return !this.completed
				&& this.scent != null
				&& this.yorkie.level() instanceof ServerLevel level
				&& StructureScentEligibility.canSniff(level, this.yorkie, this.config);
	}

	@Override
	public boolean requiresUpdateEveryTick() {
		return true;
	}

	@Override
	public void start() {
		this.movement.reset();
		this.notifier.reset();
		this.nextCircleBackTick = this.config.circleBackIntervalTicks();
		this.circleBackTicks = 0;
		this.celebrateTicks = 0;
		this.trailConfidence.reset();
		this.completed = false;
		this.message("message.mushroom_yorkie.scent_start", true);
		this.debugState("start", "message.mushroom_yorkie.scent_debug_start", true);
		MushroomYorkieSounds.bark(this.yorkie);
	}

	@Override
	public void stop() {
		this.yorkie.getNavigation().stop();
		this.scent = null;
		this.completed = false;
	}

	@Override
	public void tick() {
		if (this.scent == null || !(this.yorkie.level() instanceof ServerLevel level) || !(this.yorkie.getOwner() instanceof Player owner)) {
			this.completed = true;
			return;
		}

		if (this.celebrateTicks > 0) {
			this.debugState("celebrating", "message.mushroom_yorkie.scent_debug_celebrating", false);
			this.celebrateTicks = StructureScentCelebration.tick(level, this.yorkie, this.celebrateTicks);
			if (this.celebrateTicks <= 0) {
				this.completed = true;
			}
			return;
		}

		if (this.hasArrived(level, owner)) {
			this.message("message.mushroom_yorkie.scent_arrived", true);
			this.yorkie.getNavigation().stop();
			this.celebrateTicks = CELEBRATE_TICKS;
			return;
		}

		if (this.tickTrailConfidence(level, owner)) {
			this.debugState("recovering", "message.mushroom_yorkie.scent_debug_recovering", false);
			this.movement.tickRecovery(owner, this.config);
			return;
		}

		if (StructureScentPolicy.shouldWaitForOwner(this.yorkie.distanceToSqr(owner), this.config.leadAheadBlocks())) {
			if (StructureScentPolicy.shouldReturnToOwner(this.yorkie.distanceToSqr(owner), this.config.leadAheadBlocks())) {
				this.debugState("rejoining", "message.mushroom_yorkie.scent_debug_rejoining", false);
				this.message("message.mushroom_yorkie.scent_rejoining", false);
				this.circleBackTicks = Math.max(this.circleBackTicks, this.config.circleBackTicks());
				this.nextCircleBackTick = this.config.circleBackIntervalTicks();
				this.circleBackTicks = this.movement.circleBackToOwner(level, owner, this.scent, this.config, this.circleBackTicks);
				return;
			}

			this.debugState("waiting", "message.mushroom_yorkie.scent_debug_waiting", false);
			this.waitForOwner(owner);
			return;
		}

		if (this.shouldCircleBack(owner)) {
			this.circleBackTicks = this.config.circleBackTicks();
			this.nextCircleBackTick = this.config.circleBackIntervalTicks();
		}

		if (this.circleBackTicks > 0) {
			this.debugState("circling_back", "message.mushroom_yorkie.scent_debug_circling_back", false);
			this.circleBackTicks = this.movement.circleBackToOwner(level, owner, this.scent, this.config, this.circleBackTicks);
			return;
		}

		this.debugState("leading", "message.mushroom_yorkie.scent_debug_leading", false);
		this.leadOwner(level, owner);
	}

	private boolean hasArrived(ServerLevel level, Player owner) {
		return StructureScentArrival.hasArrived(level, this.yorkie, owner, this.scent, this.config);
	}

	private boolean tickTrailConfidence(ServerLevel level, Player owner) {
		boolean blocked = this.config.canLoseTrail() && StructureScentTerrain.trailBlocked(level, this.yorkie, owner, this.scent, this.config);
		StructureScentTrailUpdate update = this.trailConfidence.tick(blocked, this.config.recoveryTicks());

		if (update.startedRecovery()) {
			this.message("message.mushroom_yorkie.scent_lost", false);
		}

		if (update.recovered()) {
			this.message("message.mushroom_yorkie.scent_recovered", false);
			return false;
		}

		if (!update.recovering()) {
			return false;
		}

		if (update.gaveUp()) {
			this.debugState("giving_up", "message.mushroom_yorkie.scent_debug_giving_up", true);
			this.completed = true;
		}
		return true;
	}

	private void waitForOwner(Player owner) {
		this.message("message.mushroom_yorkie.scent_waiting", false);
		this.movement.waitForOwner(owner, this.config);
	}

	private void leadOwner(ServerLevel level, Player owner) {
		this.message("message.mushroom_yorkie.scent_follow", false);
		if (this.movement.leadOwner(level, owner, this.scent, this.config) && this.config.canLoseTrail()) {
			this.trailConfidence.addBlockedTicks(10);
		}
	}

	private boolean shouldCircleBack(Player owner) {
		if (this.circleBackTicks > 0 || this.nextCircleBackTick-- > 0) {
			return false;
		}

		double closeEnough = this.config.circleBackDistanceBlocks() + 2.0D;
		return this.yorkie.distanceToSqr(owner) > closeEnough * closeEnough;
	}

	private void message(String key, boolean immediate) {
		this.notifier.message(this.config, this.scent, key, immediate);
	}

	private void debugState(String state, String key, boolean immediate) {
		this.notifier.debugState(
				this.config,
				this.scent,
				state,
				key,
				immediate,
				this.trailConfidence.blockedTicks(),
				this.trailConfidence.recoveryTicks(),
				this.circleBackTicks
		);
	}
}
