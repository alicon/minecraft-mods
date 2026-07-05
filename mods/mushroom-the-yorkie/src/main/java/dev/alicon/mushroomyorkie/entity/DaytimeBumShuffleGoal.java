package dev.alicon.mushroomyorkie.entity;

import java.util.EnumSet;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.phys.Vec3;

final class DaytimeBumShuffleGoal extends Goal {
	private static final int CHANCE_PER_TICK = 2_400;

	private final MushroomYorkieEntity yorkie;
	private int ticks;
	private int nextMoveTick;

	DaytimeBumShuffleGoal(MushroomYorkieEntity yorkie) {
		this.yorkie = yorkie;
		this.setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK));
	}

	@Override
	public boolean canUse() {
		if (!(this.yorkie.level() instanceof ServerLevel level)) {
			return false;
		}

		return this.yorkie.isTame()
				&& !this.yorkie.isOrderedToSit()
				&& !this.yorkie.isMushroomSleeping()
				&& !this.yorkie.ownerIsCreativeFlying()
				&& !this.yorkie.shouldAskToGoOutside(level)
				&& this.yorkie.onGround()
				&& isDay(level)
				&& this.yorkie.getRandom().nextInt(CHANCE_PER_TICK) == 0;
	}

	@Override
	public boolean canContinueToUse() {
		return this.ticks > 0
				&& this.yorkie.level() instanceof ServerLevel level
				&& !this.yorkie.isOrderedToSit()
				&& !this.yorkie.isMushroomSleeping()
				&& !this.yorkie.shouldAskToGoOutside(level);
	}

	@Override
	public void start() {
		this.ticks = 45 + this.yorkie.getRandom().nextInt(35);
		this.nextMoveTick = 0;
		this.yorkie.setInSittingPose(true);
		MushroomBehaviorDebugger.debug(this.yorkie, "bum_shuffle", "play: daytime bum shuffle", true);
	}

	@Override
	public void stop() {
		this.yorkie.getNavigation().stop();
		if (!this.yorkie.isOrderedToSit() && !this.yorkie.isMushroomSleeping()) {
			this.yorkie.setInSittingPose(false);
		}
	}

	@Override
	public void tick() {
		this.ticks--;
		if (this.nextMoveTick-- > 0 && !this.yorkie.getNavigation().isDone()) {
			return;
		}

		double angle = this.yorkie.getRandom().nextDouble() * Math.PI * 2.0D;
		Vec3 target = this.yorkie.position().add(Math.cos(angle) * 1.2D, 0.0D, Math.sin(angle) * 1.2D);
		this.yorkie.getNavigation().moveTo(target.x, target.y, target.z, 0.28D);
		this.nextMoveTick = 18;
	}

	private static boolean isDay(ServerLevel level) {
		long dayTime = level.getDayTime() % 24_000L;
		return dayTime < 12_000L;
	}
}
