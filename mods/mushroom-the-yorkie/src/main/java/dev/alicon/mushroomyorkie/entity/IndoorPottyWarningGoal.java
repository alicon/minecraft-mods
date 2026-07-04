package dev.alicon.mushroomyorkie.entity;

import java.util.EnumSet;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.phys.Vec3;

final class IndoorPottyWarningGoal extends Goal {
	private final MushroomYorkieEntity yorkie;
	private BlockPos doorPos;
	private int nextMoveTick;
	private int circleStep;

	IndoorPottyWarningGoal(MushroomYorkieEntity yorkie) {
		this.yorkie = yorkie;
		this.setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK));
	}

	@Override
	public boolean canUse() {
		return this.yorkie.level() instanceof ServerLevel level && this.yorkie.shouldAskToGoOutside(level);
	}

	@Override
	public boolean canContinueToUse() {
		return this.canUse();
	}

	@Override
	public void start() {
		this.doorPos = this.findNearestDoor();
		this.nextMoveTick = 0;
		this.circleStep = 0;
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
			this.yorkie.bark();
		}

		if (this.nextMoveTick-- > 0 && !this.yorkie.getNavigation().isDone()) {
			return;
		}

		if (this.doorPos == null || this.yorkie.tickCount % (MushroomYorkieEntity.NEEDS_INTERVAL_TICKS * 3) == 0) {
			this.doorPos = this.findNearestDoor();
		}

		Vec3 target = this.nextTarget(owner);
		this.yorkie.getNavigation().moveTo(target.x, target.y, target.z, 1.0D);
		this.nextMoveTick = 45;
	}

	private Vec3 nextTarget(LivingEntity owner) {
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

	private BlockPos findNearestDoor() {
		if (!(this.yorkie.level() instanceof ServerLevel level)) {
			return null;
		}

		return MushroomDoorLocator.findNearestDoor(level, this.yorkie.blockPosition());
	}
}
