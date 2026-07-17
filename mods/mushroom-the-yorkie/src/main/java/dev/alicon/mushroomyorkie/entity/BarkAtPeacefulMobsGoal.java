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
	private int squirrelChaseTicks;

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
		if (this.target instanceof SquirrelEntity) {
			return true;
		}

		LivingEntity owner = this.yorkie.getOwner();
		return this.target != null
				&& !this.yorkie.peacefulMobBarkingMuted(level)
				&& owner != null
				&& !MushroomFoodPolicy.isHoldingPeacefulMobRecallItem(owner);
	}

	@Override
	public boolean canContinueToUse() {
		if (!(this.yorkie.level() instanceof ServerLevel level)
				|| !this.canStayInGoal(level)
				|| !(this.target instanceof SquirrelEntity) && this.yorkie.peacefulMobBarkingMuted(level)) {
			return false;
		}

		if (this.target instanceof SquirrelEntity squirrel && this.shouldGiveUpSquirrel(squirrel)) {
			this.yorkie.peacefulMobMemory.remember(squirrel);
			MushroomOwnerNotice.send(this.yorkie, "message.mushroom_yorkie.notice_squirrel_done", MushroomOwnerNotice.MEDIUM_COOLDOWN_TICKS);
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
		this.squirrelChaseTicks = 0;
		String message = this.target instanceof SquirrelEntity
				? "message.mushroom_yorkie.notice_squirrel"
				: "message.mushroom_yorkie.notice_peaceful_mob";
		MushroomOwnerNotice.send(this.yorkie, message, MushroomOwnerNotice.MEDIUM_COOLDOWN_TICKS);
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
		if (this.target instanceof SquirrelEntity) {
			this.squirrelChaseTicks++;
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

		if (!(this.target instanceof SquirrelEntity) && MushroomFoodPolicy.isHoldingPeacefulMobRecallItem(owner)) {
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
			MushroomYorkieSounds.bark(this.yorkie);
		}
	}

	private boolean canStartChase(ServerLevel level) {
		LivingEntity owner = this.yorkie.getOwner();
		return this.canStayInGoal(level)
				&& owner != null
				&& this.yorkie.distanceToSqr(owner) <= OWNER_RECALL_DISTANCE_SQR;
	}

	private boolean canStayInGoal(ServerLevel level) {
		return this.yorkie.isTame()
				&& !this.yorkie.isOrderedToSit()
				&& !this.yorkie.isMushroomSleeping()
				&& !this.yorkie.isNoGravity()
				&& !MushroomNightBehavior.shouldAskToGoOutside(this.yorkie, level)
				&& !MushroomBehaviorProfiles.keepsCreativeBuilderFocus(this.yorkie, level)
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
		Animal closestSquirrel = null;
		double closestDistance = Double.MAX_VALUE;
		double closestSquirrelDistance = Double.MAX_VALUE;
		for (Animal animal : animals) {
			double distance = this.yorkie.distanceToSqr(animal);
			if (animal instanceof SquirrelEntity && distance < closestSquirrelDistance) {
				closestSquirrel = animal;
				closestSquirrelDistance = distance;
			}
			if (distance < closestDistance) {
				closest = animal;
				closestDistance = distance;
			}
		}

		return closestSquirrel == null ? closest : closestSquirrel;
	}

	private boolean shouldGiveUpSquirrel(SquirrelEntity squirrel) {
		LivingEntity owner = this.yorkie.getOwner();
		double ownerDistance = owner == null ? 0.0D : squirrel.distanceToSqr(owner);
		if (!SquirrelChasePolicy.shouldGiveUp(this.squirrelChaseTicks, squirrel.hasFoundTree(), ownerDistance)) {
			return false;
		}

		if (this.squirrelChaseTicks >= SquirrelChasePolicy.MAX_CHASE_TICKS) {
			MushroomBehaviorDebugger.debug(this.yorkie, "squirrel_timeout", "squirrel: gave up after 30 seconds", true);
			return true;
		}

		MushroomBehaviorDebugger.debug(this.yorkie, "squirrel_far", "squirrel: gave up because it ran too far without a tree", true);
		return true;
	}

	private String targetName() {
		return this.target == null ? "nothing" : this.target.getName().getString();
	}
}
