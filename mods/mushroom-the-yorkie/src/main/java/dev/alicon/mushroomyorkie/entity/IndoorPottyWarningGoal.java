package dev.alicon.mushroomyorkie.entity;

import java.util.EnumSet;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.phys.Vec3;

final class IndoorPottyWarningGoal extends Goal {
	private static final int TARGET_REFRESH_TICKS = 60;

	private final MushroomYorkieEntity yorkie;
	private BlockPos outdoorPos;
	private BlockPos doorPos;
	private int nextMoveTick;
	private int nextTargetSearchTick;
	private int circleStep;

	IndoorPottyWarningGoal(MushroomYorkieEntity yorkie) {
		this.yorkie = yorkie;
		this.setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK));
	}

	@Override
	public boolean canUse() {
		return this.yorkie.level() instanceof ServerLevel level
				&& MushroomNightBehavior.shouldAskToGoOutside(this.yorkie, level)
				&& !MushroomBehaviorProfiles.keepsRoutineNeedsQuiet(this.yorkie, level);
	}

	@Override
	public boolean canContinueToUse() {
		return this.canUse();
	}

	@Override
	public void start() {
		this.refreshTargets();
		this.nextMoveTick = 0;
		this.nextTargetSearchTick = this.yorkie.tickCount + TARGET_REFRESH_TICKS;
		this.circleStep = 0;
		MushroomOwnerNotice.send(this.yorkie, "message.mushroom_yorkie.notice_potty", MushroomOwnerNotice.MEDIUM_COOLDOWN_TICKS);
		MushroomBehaviorDebugger.debug(this.yorkie, "potty_warning_start", "potty warning: needs outside", true);
	}

	@Override
	public boolean requiresUpdateEveryTick() {
		return true;
	}

	@Override
	public void tick() {
		LivingEntity owner = this.yorkie.getOwner();
		if (owner != null) {
			this.yorkie.getLookControl().setLookAt(owner, 10.0F, this.yorkie.getMaxHeadXRot());
		}

		if (this.yorkie.tickCount % MushroomYorkieEntity.BARK_INTERVAL_TICKS == 0) {
			MushroomYorkieSounds.bark(this.yorkie);
		}
		this.debugTarget();

		if (this.nextMoveTick-- > 0 && !this.yorkie.getNavigation().isDone()) {
			return;
		}

		if (this.outdoorPos == null || this.yorkie.tickCount >= this.nextTargetSearchTick) {
			this.refreshTargets();
			this.nextTargetSearchTick = this.yorkie.tickCount + TARGET_REFRESH_TICKS;
		}

		Vec3 target = this.nextTarget(owner);
		this.yorkie.getNavigation().moveTo(target.x, target.y, target.z, 1.0D);
		this.nextMoveTick = 45;
	}

	private Vec3 nextTarget(LivingEntity owner) {
		if (this.outdoorPos != null) {
			return Vec3.atBottomCenterOf(this.outdoorPos);
		}

		if (this.doorPos == null) {
			Vec3 center = owner == null ? this.yorkie.position() : owner.position();
			double angle = (this.yorkie.tickCount % 100) * (Math.PI * 2.0D / 100.0D);
			return center.add(Math.cos(angle) * 1.8D, 0.0D, Math.sin(angle) * 1.8D);
		}

		this.circleStep++;
		Vec3 center = Vec3.atBottomCenterOf(this.doorPos);
		double angle = this.circleStep * (Math.PI / 3.0D);
		return center.add(Math.cos(angle) * 1.8D, 0.0D, Math.sin(angle) * 1.8D);
	}

	private void refreshTargets() {
		if (!(this.yorkie.level() instanceof ServerLevel level)) {
			this.outdoorPos = null;
			this.doorPos = null;
			return;
		}

		BlockPos origin = this.yorkie.blockPosition();
		this.outdoorPos = MushroomOutdoorLocator.findReachableOutdoor(this.yorkie, level, origin);
		this.doorPos = this.outdoorPos == null ? MushroomDoorLocator.findNearestDoor(level, origin) : null;
	}

	private void debugTarget() {
		if (this.outdoorPos != null) {
			MushroomBehaviorDebugger.debug(this.yorkie, "potty_warning_outdoor", "potty warning: heading toward reachable outdoors", false);
			return;
		}

		boolean foundDoor = this.doorPos != null;
		MushroomBehaviorDebugger.debug(
				this.yorkie,
				foundDoor ? "potty_warning_door" : "potty_warning_owner",
				foundDoor ? "potty warning: no reachable outdoor path, circling nearest door" : "potty warning: circling owner, no nearby door",
				false
		);
	}
}
