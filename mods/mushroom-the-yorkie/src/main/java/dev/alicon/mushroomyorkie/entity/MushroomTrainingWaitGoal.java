package dev.alicon.mushroomyorkie.entity;

import java.util.EnumSet;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.entity.player.Player;

final class MushroomTrainingWaitGoal extends Goal {
	private final MushroomYorkieEntity dog;

	MushroomTrainingWaitGoal(MushroomYorkieEntity dog) {
		this.dog = dog;
		this.setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK));
	}

	@Override
	public boolean canUse() {
		return this.dog.getOwner() instanceof Player owner && this.dog.leaveItTraining.shouldHoldForTreat(this.dog, owner);
	}

	@Override
	public void start() {
		this.dog.getNavigation().stop();
	}

	@Override
	public void tick() {
		if (this.dog.getOwner() instanceof Player owner) {
			this.dog.getLookControl().setLookAt(owner);
		}
	}
}
