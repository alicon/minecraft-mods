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
	private boolean following;

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
	public void start() {
		super.start();
		this.following = true;
	}

	@Override
	public void stop() {
		super.stop();
		this.following = false;
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
		return this.dog.onGround() && this.dog.level() instanceof ServerLevel && this.survivalOwner() != null;
	}

	private Player survivalOwner() {
		return !this.dog.isInWater() && this.dog.getOwner() instanceof Player owner
				&& owner.level() == this.dog.level() && !owner.isCreative() && !owner.isSpectator() ? owner : null;
	}

	Vec3 guardStride(Vec3 movement) {
		if (!this.following || this.dog.isOrderedToSit() || this.dog.isPassenger()
				|| this.dog.hurtTime > 0 || movement.y > 0 || movement.horizontalDistanceSqr() == 0
				|| !(this.dog.level() instanceof ServerLevel level)) {
			return movement;
		}
		Player owner = this.survivalOwner();
		if (owner == null) {
			return movement;
		}
		double footY = Math.ceil(this.dog.getY() - 1.0E-4);
		BlockPos here = BlockPos.containing(this.dog.getX(), footY, this.dog.getZ());
		BlockPos ahead = BlockPos.containing(this.dog.getX() + movement.x, footY, this.dog.getZ() + movement.z);
		if (here.equals(ahead) || MushroomExpeditionFooting.hasSafeLanding(level, ahead)
				|| !MushroomExpeditionFooting.hasSafeLanding(level, here)) {
			return movement;
		}
		this.blockedStep = ahead;
		this.ownerAtWarning = owner.position();
		warn(this.dog, level, owner, ahead);
		pauseWalking(this.dog);
		return new Vec3(0, movement.y, 0);
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
		warn(dog, level, handler, step);
		return true;
	}

	private static void warn(MushroomYorkieEntity dog, ServerLevel level, Player handler, BlockPos step) {
		var warning = GlobalPos.of(level.dimension(), step);
		if (!warning.equals(dog.lastWarnedTrailStep)) {
			dog.lastWarnedTrailStep = warning;
			MushroomYorkieSounds.bark(dog);
			MushroomCampInteractions.notice(handler, "trail_unsafe");
		}
	}
}
