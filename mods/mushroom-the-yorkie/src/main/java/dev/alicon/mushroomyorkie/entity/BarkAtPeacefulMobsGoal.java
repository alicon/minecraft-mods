package dev.alicon.mushroomyorkie.entity;

import java.util.EnumSet;
import java.util.List;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.entity.animal.Animal;
import net.minecraft.world.phys.AABB;

final class BarkAtPeacefulMobsGoal extends Goal {
	private static final double OWNER_RECALL_DISTANCE_SQR = 24.0D * 24.0D;

	private final MushroomYorkieEntity yorkie;
	private Animal target;
	private int nextSearchTick;

	BarkAtPeacefulMobsGoal(MushroomYorkieEntity yorkie) {
		this.yorkie = yorkie;
		this.setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK));
	}

	@Override
	public boolean canUse() {
		if (!(this.yorkie.level() instanceof ServerLevel level) || !this.canStartChase(level)) {
			return false;
		}

		this.target = this.findTarget(level);
		return this.target != null;
	}

	@Override
	public boolean canContinueToUse() {
		if (!(this.yorkie.level() instanceof ServerLevel level) || !this.canStayInGoal(level)) {
			return false;
		}

		return this.target != null && this.target.isAlive() && this.yorkie.distanceToSqr(this.target) < 196.0D;
	}

	@Override
	public boolean requiresUpdateEveryTick() {
		return true;
	}

	@Override
	public void start() {
		MushroomOwnerNotice.send(this.yorkie, "message.mushroom_yorkie.notice_peaceful_mob", MushroomOwnerNotice.MEDIUM_COOLDOWN_TICKS);
		MushroomBehaviorDebugger.debug(this.yorkie, "peaceful_mob_start", "peaceful mob: found " + this.targetName(), true);
	}

	@Override
	public void stop() {
		MushroomBehaviorDebugger.debug(this.yorkie, "peaceful_mob_stop", "peaceful mob: stopped barking", true);
		this.target = null;
		this.yorkie.getNavigation().stop();
	}

	@Override
	public void tick() {
		if (this.target == null) {
			return;
		}

		LivingEntity owner = this.yorkie.getOwner();
		if (owner == null) {
			return;
		}

		if (this.yorkie.distanceToSqr(owner) > OWNER_RECALL_DISTANCE_SQR) {
			this.yorkie.getLookControl().setLookAt(owner, 10.0F, this.yorkie.getMaxHeadXRot());
			this.yorkie.getNavigation().moveTo(owner, 1.35D);
			MushroomOwnerNotice.send(this.yorkie, "message.mushroom_yorkie.notice_peaceful_return", MushroomOwnerNotice.MEDIUM_COOLDOWN_TICKS);
			MushroomBehaviorDebugger.debug(this.yorkie, "peaceful_mob_owner_far", "peaceful mob: returning because owner walked away", false);
			return;
		}

		if (MushroomFoodPolicy.isHoldingPeacefulMobRecallItem(owner)) {
			if (MushroomFoodPolicy.isHoldingPeacefulMobCalmingItem(owner)) {
				this.yorkie.mutePeacefulMobBarking((ServerLevel) this.yorkie.level());
				MushroomOwnerNotice.send(this.yorkie, "message.mushroom_yorkie.notice_peaceful_calmed", MushroomOwnerNotice.MEDIUM_COOLDOWN_TICKS);
			} else {
				MushroomOwnerNotice.send(this.yorkie, "message.mushroom_yorkie.notice_peaceful_return", MushroomOwnerNotice.MEDIUM_COOLDOWN_TICKS);
			}
			this.yorkie.getNavigation().moveTo(owner, 1.25D);
			MushroomBehaviorDebugger.debug(this.yorkie, "peaceful_mob_recall", "peaceful mob: returning because owner has a recall item", false);
			return;
		}

		this.yorkie.getLookControl().setLookAt(this.target, 10.0F, this.yorkie.getMaxHeadXRot());
		this.yorkie.getNavigation().moveTo(this.target, 1.15D);
		MushroomBehaviorDebugger.debug(this.yorkie, "peaceful_mob_bark", "peaceful mob: barking at " + this.targetName(), false);
		if (this.yorkie.tickCount % MushroomYorkieEntity.BARK_INTERVAL_TICKS == 0) {
			this.yorkie.bark();
		}
	}

	private boolean canStartChase(ServerLevel level) {
		LivingEntity owner = this.yorkie.getOwner();
		return this.canStayInGoal(level)
				&& owner != null
				&& this.yorkie.distanceToSqr(owner) <= OWNER_RECALL_DISTANCE_SQR
				&& !MushroomFoodPolicy.isHoldingPeacefulMobRecallItem(owner);
	}

	private boolean canStayInGoal(ServerLevel level) {
		return this.yorkie.isTame()
				&& !this.yorkie.isOrderedToSit()
				&& !this.yorkie.isMushroomSleeping()
				&& !this.yorkie.isUsingCreativeFlight()
				&& !this.yorkie.shouldAskToGoOutside(level)
				&& !MushroomBehaviorProfiles.keepsCreativeBuilderFocus(this.yorkie, level)
				&& !this.yorkie.peacefulMobBarkingMuted(level)
				&& this.yorkie.getOwner() != null;
	}

	private Animal findTarget(ServerLevel level) {
		if (this.nextSearchTick-- > 0 && this.target != null && this.target.isAlive()) {
			return this.target;
		}

		this.nextSearchTick = 40;
		AABB area = this.yorkie.getBoundingBox().inflate(MushroomYorkieEntity.PEACEFUL_MOB_SEARCH_RADIUS, 4.0D, MushroomYorkieEntity.PEACEFUL_MOB_SEARCH_RADIUS);
		List<Animal> animals = level.getEntitiesOfClass(
				Animal.class,
				area,
				animal -> animal != this.yorkie && animal.isAlive() && !this.yorkie.peacefulMobMemory.remembers(animal)
		);
		Animal closest = null;
		double closestDistance = Double.MAX_VALUE;
		for (Animal animal : animals) {
			double distance = this.yorkie.distanceToSqr(animal);
			if (distance < closestDistance) {
				closest = animal;
				closestDistance = distance;
			}
		}

		return closest;
	}

	private String targetName() {
		return this.target == null ? "nothing" : this.target.getName().getString();
	}
}
