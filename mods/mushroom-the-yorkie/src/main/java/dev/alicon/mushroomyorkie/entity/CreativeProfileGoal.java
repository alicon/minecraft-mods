package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.block.ModBlocks;
import java.util.EnumSet;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.phys.Vec3;

final class CreativeProfileGoal extends Goal {
	private static final int CHECK_IN_TICKS = 20 * 5;
	private static final int MOVE_RETRY_TICKS = 40;
	private static final double BED_REACHED_DISTANCE_SQR = 0.64D;
	private static final double BED_TOP_Y_OFFSET = 0.25D;
	private static final double CHECK_IN_DISTANCE_SQR = 9.0D;

	private final MushroomYorkieEntity yorkie;
	private BlockPos bedPos;
	private Vec3 bedTarget;
	private int checkInTicks;
	private int nextMoveTick;
	private boolean napNotified;

	CreativeProfileGoal(MushroomYorkieEntity yorkie) {
		this.yorkie = yorkie;
		this.setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK));
	}

	@Override
	public boolean canUse() {
		return this.yorkie.level() instanceof ServerLevel level
				&& !this.yorkie.isOrderedToSit()
				&& !this.yorkie.shouldSleepAtNight(level)
				&& MushroomBehaviorProfiles.keepsCreativeBuilderFocus(this.yorkie, level);
	}

	@Override
	public boolean canContinueToUse() {
		return this.canUse();
	}

	@Override
	public void start() {
		this.bedPos = null;
		this.bedTarget = null;
		this.checkInTicks = 0;
		this.nextMoveTick = 0;
		this.napNotified = false;
		MushroomOwnerNotice.send(this.yorkie, "message.mushroom_yorkie.notice_creative_build", MushroomOwnerNotice.LONG_COOLDOWN_TICKS);
		MushroomBehaviorDebugger.debug(this.yorkie, "creative_profile_start", "creative profile: owner is building, settling down", true);
	}

	@Override
	public void stop() {
		if (this.yorkie.level() instanceof ServerLevel level && !this.yorkie.shouldSleepAtNight(level)) {
			this.yorkie.setSleeping(false);
		}
		this.bedPos = null;
		this.bedTarget = null;
		this.checkInTicks = 0;
		this.napNotified = false;
	}

	@Override
	public boolean requiresUpdateEveryTick() {
		return true;
	}

	@Override
	public void tick() {
		if (!(this.yorkie.level() instanceof ServerLevel level) || this.yorkie.getOwner() == null) {
			return;
		}

		LivingEntity owner = this.yorkie.getOwner();
		if (MushroomBehaviorProfiles.buildActionJustHappened(this.yorkie, level)) {
			this.checkInTicks = 0;
		} else if (this.checkInTicks <= 0 && MushroomBehaviorProfiles.shouldStartCreativeCheckIn(this.yorkie, level)) {
			this.checkInTicks = CHECK_IN_TICKS;
			this.yorkie.bark();
			MushroomOwnerNotice.send(this.yorkie, "message.mushroom_yorkie.notice_creative_checkin", MushroomOwnerNotice.LONG_COOLDOWN_TICKS);
			MushroomBehaviorDebugger.debug(this.yorkie, "creative_profile_checkin", "creative profile: checking if owner is done building", true);
		}

		if (this.checkInTicks > 0) {
			this.tickCheckIn(owner);
			return;
		}

		if (!MushroomBehaviorProfiles.shouldNapDuringCreativeBuild(this.yorkie, level)) {
			this.watchOwner(owner);
			return;
		}

		this.tickNap(level, owner);
	}

	private void tickCheckIn(LivingEntity owner) {
		this.yorkie.setSleeping(false);
		this.yorkie.getLookControl().setLookAt(owner, 10.0F, this.yorkie.getMaxHeadXRot());
		if (this.yorkie.distanceToSqr(owner) > CHECK_IN_DISTANCE_SQR) {
			this.yorkie.getNavigation().moveTo(owner, 1.0D);
		} else {
			this.yorkie.getNavigation().stop();
		}
		this.checkInTicks--;
	}

	private void watchOwner(LivingEntity owner) {
		this.napNotified = false;
		this.yorkie.setSleeping(false);
		this.yorkie.getNavigation().stop();
		this.yorkie.getLookControl().setLookAt(owner, 10.0F, this.yorkie.getMaxHeadXRot());
		MushroomBehaviorDebugger.debug(this.yorkie, "creative_profile_quiet", "creative profile: watching owner build", false);
	}

	private void tickNap(ServerLevel level, LivingEntity owner) {
		this.refreshBed(level);
		if (this.bedTarget != null && this.yorkie.distanceToSqr(this.bedTarget) > BED_REACHED_DISTANCE_SQR) {
			this.moveToBed();
			return;
		}

		if (this.bedTarget != null) {
			this.yorkie.setPos(this.bedTarget.x, this.bedTarget.y, this.bedTarget.z);
		}
		if (!this.napNotified) {
			MushroomOwnerNotice.send(this.yorkie, "message.mushroom_yorkie.notice_creative_nap", MushroomOwnerNotice.LONG_COOLDOWN_TICKS);
			this.napNotified = true;
		}
		this.yorkie.setSleeping(true);
		this.yorkie.getLookControl().setLookAt(owner, 10.0F, this.yorkie.getMaxHeadXRot());
		this.yorkie.setDeltaMovement(this.yorkie.getDeltaMovement().scale(0.3D));
		MushroomBehaviorDebugger.debug(this.yorkie, "creative_profile_nap", this.bedTarget == null ? "creative profile: napping nearby" : "creative profile: napping on dog bed", false);
	}

	private void refreshBed(ServerLevel level) {
		if (this.bedPos != null && level.getBlockState(this.bedPos).is(ModBlocks.DOG_BED)) {
			return;
		}

		this.bedPos = MushroomDomesticLocator.findNearestDogBed(level, this.yorkie.blockPosition());
		this.bedTarget = this.bedPos == null ? null : Vec3.atBottomCenterOf(this.bedPos).add(0.0D, BED_TOP_Y_OFFSET, 0.0D);
	}

	private void moveToBed() {
		this.yorkie.setSleeping(false);
		this.yorkie.getLookControl().setLookAt(this.bedTarget);
		if (this.nextMoveTick-- > 0 && !this.yorkie.getNavigation().isDone()) {
			return;
		}

		this.yorkie.getNavigation().moveTo(this.bedTarget.x, this.bedTarget.y, this.bedTarget.z, 0.8D);
		this.nextMoveTick = MOVE_RETRY_TICKS;
		MushroomBehaviorDebugger.debug(this.yorkie, "creative_profile_bed", "creative profile: heading to dog bed", false);
	}
}
