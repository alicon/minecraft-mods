package dev.alicon.mushroomyorkie.entity;

import java.util.EnumSet;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.entity.ai.util.LandRandomPos;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.pathfinder.Path;
import net.minecraft.world.phys.Vec3;

/** Brief pauses and invitations during an owner-held walk; ordinary following stays with the native leash. */
final class MushroomLeadWalkGoal extends Goal {
	private static final double WALK_SLACK_SQR = 4.0D * 4.0D;
	private static final int MIN_WALK_INTERVAL_TICKS = 20 * 25;
	private static final int VARIABLE_WALK_INTERVAL_TICKS = 20 * 20;
	private static final int SNIFF_TICKS = 20 * 3;
	private static final int STUBBORN_TICKS = 25;
	private static final int STUBBORN_CHANCE = 12;
	private static final int INTERRUPTED_POTTY_RETRY_TICKS = 100;

	private final MushroomYorkieEntity yorkie;
	private long nextWalkChoice = -1L;
	private long nextPottyStop;
	private int ticksLeft;
	private Activity activity;
	private Vec3 sniffTarget;
	private Path sniffPath;
	private long reliefDayBefore;
	private boolean invited;

	MushroomLeadWalkGoal(MushroomYorkieEntity yorkie) {
		this.yorkie = yorkie;
		this.setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK));
	}

	@Override
	public boolean canUse() {
		if (!(this.yorkie.level() instanceof ServerLevel level) || !this.canTakeABreak()) return false;
		long now = level.getGameTime();
		long day = MushroomNightBehavior.currentDay(level);
		if (now >= this.nextPottyStop && level.canSeeSky(this.yorkie.blockPosition())
				&& this.yorkie.relief.shouldAskToday(day, this.yorkie.needs.shouldWarnPotty())) {
			this.activity = Activity.POTTY;
			return true;
		}
		if (this.nextWalkChoice < 0L) {
			this.scheduleNextWalkChoice(now);
			return false;
		}
		if (now < this.nextWalkChoice) return false;
		this.scheduleNextWalkChoice(now);
		int choice = this.yorkie.getRandom().nextInt(STUBBORN_CHANCE);
		if (choice == 0) {
			this.activity = Activity.STUBBORN;
			return true;
		}
		if (choice > 7) return false;
		var owner = this.yorkie.getOwner();
		this.sniffTarget = LandRandomPos.getPosAway(this.yorkie, 3, 2, owner.position());
		if (this.sniffTarget == null || owner.distanceToSqr(this.sniffTarget) > WALK_SLACK_SQR) return false;
		BlockPos target = BlockPos.containing(this.sniffTarget);
		if (!level.getFluidState(target).isEmpty()) return false;
		this.sniffPath = this.yorkie.getNavigation().createPath(target, 0);
		if (this.sniffPath == null || !this.sniffPath.canReach()) return false;
		this.activity = Activity.SNIFF;
		return true;
	}

	@Override
	public boolean canContinueToUse() {
		return this.ticksLeft > 0 && this.canTakeABreak()
				&& (this.activity != Activity.POTTY || this.yorkie.relief.lastReliefDay() == this.reliefDayBefore
				&& this.yorkie.level().canSeeSky(this.yorkie.blockPosition()));
	}

	@Override
	public void start() {
		this.invited = false;
		this.ticksLeft = switch (this.activity) {
			case POTTY -> MushroomReliefHandler.RELIEF_TICKS;
			case SNIFF -> SNIFF_TICKS;
			case STUBBORN -> STUBBORN_TICKS;
		};
		if (this.activity == Activity.SNIFF) {
			this.yorkie.getNavigation().moveTo(this.sniffPath, 0.8D);
			this.yorkie.getLookControl().setLookAt(this.sniffTarget);
		} else {
			MushroomMovement.stop(this.yorkie);
			this.reliefDayBefore = this.yorkie.relief.lastReliefDay();
			if (this.activity == Activity.POTTY) {
				this.nextPottyStop = this.yorkie.level().getGameTime() + INTERRUPTED_POTTY_RETRY_TICKS;
			} else {
				MushroomYorkieSounds.bark(this.yorkie);
			}
		}
	}

	@Override
	public void tick() {
		this.ticksLeft--;
		if (this.activity != Activity.SNIFF && this.canTakeABreak()) MushroomMovement.stop(this.yorkie);
		if (this.activity != Activity.SNIFF || this.yorkie.getNavigation().isDone()) {
			var owner = this.yorkie.getOwner();
			if (owner != null) this.yorkie.getLookControl().setLookAt(owner, 25.0F, this.yorkie.getMaxHeadXRot());
			if (this.activity == Activity.SNIFF && !this.invited) {
				this.invited = true;
				MushroomYorkieSounds.bark(this.yorkie);
			}
		}
	}

	@Override
	public boolean requiresUpdateEveryTick() {
		return true;
	}

	@Override
	public void stop() {
		this.yorkie.getNavigation().stop();
		this.activity = null;
		this.sniffPath = null;
		this.sniffTarget = null;
	}

	private boolean canTakeABreak() {
		return this.yorkie.getOwner() instanceof Player owner && this.yorkie.getLeashHolder() == owner
				&& !this.yorkie.isOrderedToSit() && !this.yorkie.isMushroomSleeping() && !this.yorkie.isPassenger()
				&& !this.yorkie.isNoGravity() && !MushroomYorkieStateQueries.ownerIsCreativeFlying(this.yorkie)
				&& this.yorkie.onGround() && !MushroomYorkieStateQueries.isWetForSitting(this.yorkie)
				&& this.yorkie.distanceToSqr(owner) <= WALK_SLACK_SQR;
	}

	private void scheduleNextWalkChoice(long now) {
		this.nextWalkChoice = now + MIN_WALK_INTERVAL_TICKS + this.yorkie.getRandom().nextInt(VARIABLE_WALK_INTERVAL_TICKS);
	}

	private enum Activity {
		POTTY, SNIFF, STUBBORN
	}
}
