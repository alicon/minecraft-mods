package dev.alicon.mushroomyorkie.entity;

import java.util.EnumSet;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
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

		long day = MushroomNightBehavior.currentDay(level);
		for (BowlUse use : BowlUse.values()) {
			if (use.isNeededBy(this.yorkie, day)) {
				BlockPos bowl = use.findNearest(level, this.yorkie.blockPosition());
				if (bowl != null) {
					this.targetPos = bowl;
					this.targetUse = use;
					return true;
				}
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
		MushroomBehaviorDebugger.debug(this.yorkie, "domestic_bowl_start", "domestic care: heading to " + this.targetUse.debugName(), true);
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
			if (this.targetUse.isStillAvailable(level, this.targetPos)) {
				this.targetUse.consume(level, this.yorkie, this.targetPos);
			}
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
				&& !MushroomBehaviorProfiles.keepsRoutineNeedsQuiet(this.yorkie, level)
				&& !this.yorkie.trust.wasScoldedToday(level);
	}
}
