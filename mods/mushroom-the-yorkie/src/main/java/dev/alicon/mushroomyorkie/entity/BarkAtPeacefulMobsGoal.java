package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.item.ModItems;
import java.util.EnumSet;
import java.util.List;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.entity.animal.Animal;
import net.minecraft.world.phys.AABB;

final class BarkAtPeacefulMobsGoal extends Goal {
	private final MushroomYorkieEntity yorkie;
	private Animal target;
	private int nextSearchTick;

	BarkAtPeacefulMobsGoal(MushroomYorkieEntity yorkie) {
		this.yorkie = yorkie;
		this.setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK));
	}

	@Override
	public boolean canUse() {
		if (!(this.yorkie.level() instanceof ServerLevel level) || !this.canChase(level)) {
			return false;
		}

		this.target = this.findTarget(level);
		return this.target != null;
	}

	@Override
	public boolean canContinueToUse() {
		if (!(this.yorkie.level() instanceof ServerLevel level) || !this.canChase(level)) {
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
		if (owner != null && owner.isHolding(ModItems.YORKIE_TREAT)) {
			this.yorkie.mutePeacefulMobBarking((ServerLevel) this.yorkie.level());
			this.yorkie.getNavigation().moveTo(owner, 1.25D);
			MushroomBehaviorDebugger.debug(this.yorkie, "peaceful_mob_treat", "peaceful mob: returning because owner has treat", false);
			return;
		}

		this.yorkie.getLookControl().setLookAt(this.target, 10.0F, this.yorkie.getMaxHeadXRot());
		this.yorkie.getNavigation().moveTo(this.target, 1.15D);
		MushroomBehaviorDebugger.debug(this.yorkie, "peaceful_mob_bark", "peaceful mob: barking at " + this.targetName(), false);
		if (this.yorkie.tickCount % MushroomYorkieEntity.BARK_INTERVAL_TICKS == 0) {
			this.yorkie.bark();
		}
	}

	private boolean canChase(ServerLevel level) {
		LivingEntity owner = this.yorkie.getOwner();
		return this.yorkie.isTame()
				&& !this.yorkie.isOrderedToSit()
				&& !this.yorkie.isMushroomSleeping()
				&& !this.yorkie.shouldAskToGoOutside(level)
				&& !this.yorkie.peacefulMobBarkingMuted(level)
				&& (owner == null || !owner.isHolding(ModItems.YORKIE_TREAT));
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
