package dev.alicon.mushroomyorkie.entity;

import net.minecraft.core.BlockPos;
import net.minecraft.core.GlobalPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.ai.goal.FollowOwnerGoal;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.phys.Vec3;

final class MushroomTrailFollowingGoal extends FollowOwnerGoal {
	private final MushroomYorkieEntity dog;
	private BlockPos blockedStep;
	private Vec3 ownerAtWarning;

	MushroomTrailFollowingGoal(MushroomYorkieEntity dog) {
		super(dog, 1.25D, 2.0F, 1.0F);
		this.dog = dog;
	}

	@Override
	public boolean canContinueToUse() {
		return this.blockedStep != null && this.canCheckFooting() && !this.dog.isOrderedToSit()
				&& this.dog.getOwner().position().distanceToSqr(this.ownerAtWarning) <= 4
				|| super.canContinueToUse();
	}

	@Override
	public void stop() {
		super.stop();
		this.blockedStep = null;
		this.ownerAtWarning = null;
	}

	@Override
	public void tick() {
		if (!this.canCheckFooting()) {
			super.tick();
			return;
		}
		ServerLevel level = (ServerLevel) this.dog.level();
		Player owner = (Player) this.dog.getOwner();
		if (this.blockedStep != null && owner.position().distanceToSqr(this.ownerAtWarning) <= 4
				&& warnAtStep(this.dog, level, owner, this.blockedStep)) {
			pauseWalking(this.dog);
			return;
		}
		this.blockedStep = null;
		super.tick();
		var path = this.dog.getNavigation().getPath();
		if (path == null || path.isDone()) {
			return;
		}
		for (int i = path.getNextNodeIndex(); i < path.getNodeCount(); i++) {
			BlockPos step = path.getNode(i).asBlockPos();
			if (!step.closerThan(this.dog.blockPosition(), 3)) {
				break;
			}
			if (warnAtStep(this.dog, level, owner, step)) {
				this.blockedStep = step;
				this.ownerAtWarning = owner.position();
				pauseWalking(this.dog);
				break;
			}
		}
	}

	private boolean canCheckFooting() {
		return this.dog.level() instanceof ServerLevel && this.dog.onGround() && !this.dog.isInWater()
				&& this.dog.getOwner() instanceof Player owner && !owner.isCreative() && !owner.isSpectator();
	}

	private static void pauseWalking(MushroomYorkieEntity dog) {
		dog.getNavigation().stop();
		dog.getMoveControl().setWantedPosition(dog.getX(), dog.getY(), dog.getZ(), 0);
		dog.setSpeed(0);
		dog.setDeltaMovement(0, dog.getDeltaMovement().y, 0);
	}

	static void warnOnLead(MushroomYorkieEntity dog, ServerLevel level) {
		if (!dog.onGround() || dog.isInWater() || !(dog.getLeashHolder() instanceof Player handler)
				|| handler.isCreative() || handler.isSpectator() || dog.distanceToSqr(handler) < 4) {
			return;
		}
		double dx = handler.getX() - dog.getX();
		double dz = handler.getZ() - dog.getZ();
		BlockPos step = Math.abs(dx) >= Math.abs(dz)
				? dog.blockPosition().offset(dx > 0 ? 1 : -1, 0, 0)
				: dog.blockPosition().offset(0, 0, dz > 0 ? 1 : -1);
		if (warnAtStep(dog, level, handler, step)) {
			pauseWalking(dog);
		}
	}

	private static boolean warnAtStep(MushroomYorkieEntity dog, ServerLevel level, Player handler, BlockPos step) {
		BlockPos here = dog.blockPosition();
		if (!step.closerThan(here, 3) || !MushroomExpeditionFooting.unsafeStep(level, here, step)) {
			dog.lastWarnedTrailStep = null;
			return false;
		}
		var warning = GlobalPos.of(level.dimension(), step);
		if (!warning.equals(dog.lastWarnedTrailStep)) {
			dog.lastWarnedTrailStep = warning;
			MushroomYorkieSounds.bark(dog);
			MushroomCampInteractions.notice(handler, "trail_unsafe");
		}
		return true;
	}
}
