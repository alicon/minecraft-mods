package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.block.ModBlocks;
import java.util.EnumSet;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.phys.Vec3;

final class SleepAtNightGoal extends Goal {
	private static final int MOVE_RETRY_TICKS = 40;
	private static final double BED_REACHED_DISTANCE_SQR = 0.64D;
	private static final double DOGHOUSE_REACHED_DISTANCE_SQR = 2.25D;
	private static final double BED_TOP_Y_OFFSET = 0.25D;

	private final MushroomYorkieEntity yorkie;
	private BlockPos bedPos;
	private Vec3 bedTarget;
	private int nextMoveTick;

	SleepAtNightGoal(MushroomYorkieEntity yorkie) {
		this.yorkie = yorkie;
		this.setFlags(EnumSet.of(Flag.MOVE, Flag.JUMP, Flag.LOOK));
	}

	@Override
	public boolean canUse() {
		return this.yorkie.level() instanceof ServerLevel level
				&& MushroomNightBehavior.shouldSleepAtNight(this.yorkie, level)
				&& this.yorkie.nightWakeTicks <= 0;
	}

	@Override
	public boolean canContinueToUse() {
		return this.canUse();
	}

	@Override
	public void start() {
		this.bedPos = this.findNearestBed();
		this.bedTarget = this.bedPos == null ? null : bedCenter(this.bedPos);
		this.nextMoveTick = 0;
		MushroomBehaviorDebugger.debug(this.yorkie, "sleep_start", this.bedPos == null ? "sleep: curling up because it is night inside" : "sleep: heading to dog bed", true);
		this.yorkie.setSleeping(this.bedPos == null);
	}

	@Override
	public void tick() {
		if (this.bedPos != null && this.yorkie.level() instanceof ServerLevel level && !MushroomDomesticLocator.isSleepSpot(level.getBlockState(this.bedPos))) {
			this.bedPos = null;
			this.bedTarget = null;
		}

		if (this.bedTarget != null && this.yorkie.distanceToSqr(this.bedTarget) > this.reachedDistanceSqr()) {
			this.moveToBed();
			return;
		}

		MushroomBehaviorDebugger.debug(this.yorkie, "sleeping", this.bedPos == null ? "sleep: staying still until morning or wake-up" : "sleep: curled up on dog bed", false);
		if (this.bedTarget != null) {
			this.yorkie.setPos(this.bedTarget.x, this.bedTarget.y, this.bedTarget.z);
		}
		this.yorkie.setSleeping(true);
		this.yorkie.getNavigation().stop();
		this.yorkie.setDeltaMovement(this.yorkie.getDeltaMovement().scale(0.3D));
	}

	private void moveToBed() {
		this.yorkie.setSleeping(false);
		this.yorkie.getLookControl().setLookAt(this.bedTarget);
		MushroomBehaviorDebugger.debug(this.yorkie, "sleep_bed", "sleep: walking to dog bed", false);
		if (this.nextMoveTick-- > 0 && !this.yorkie.getNavigation().isDone()) {
			return;
		}

		this.yorkie.getNavigation().moveTo(this.bedTarget.x, this.bedTarget.y, this.bedTarget.z, 0.7D);
		this.nextMoveTick = MOVE_RETRY_TICKS;
	}

	private static Vec3 bedCenter(BlockPos pos) {
		return Vec3.atBottomCenterOf(pos).add(0.0D, BED_TOP_Y_OFFSET, 0.0D);
	}

	private double reachedDistanceSqr() {
		if (this.bedPos != null
				&& this.yorkie.level() instanceof ServerLevel level
				&& level.getBlockState(this.bedPos).is(ModBlocks.DOGHOUSE)) {
			return DOGHOUSE_REACHED_DISTANCE_SQR;
		}
		return BED_REACHED_DISTANCE_SQR;
	}

	private BlockPos findNearestBed() {
		if (!(this.yorkie.level() instanceof ServerLevel level)) {
			return null;
		}

		return MushroomDomesticLocator.findNearestDogBed(level, this.yorkie.blockPosition());
	}
}
