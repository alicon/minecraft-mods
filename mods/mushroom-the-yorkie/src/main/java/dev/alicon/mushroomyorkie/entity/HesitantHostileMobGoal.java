package dev.alicon.mushroomyorkie.entity;

import java.util.EnumSet;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.entity.monster.Monster;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

final class HesitantHostileMobGoal extends Goal {
	// Poll nearby hostiles at most twice per second while there is no active threat.
	private static final int THREAT_SEARCH_INTERVAL_TICKS = 10;
	private static final double THREAT_TRACK_DISTANCE_SQR = 16.0D * 16.0D;
	private final MushroomYorkieEntity yorkie;
	private Monster target;
	private long nextSearchTick;
	private int retreatTicks;
	private int nextMoveTick;

	HesitantHostileMobGoal(MushroomYorkieEntity yorkie) {
		this.yorkie = yorkie;
		this.setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK));
	}

	@Override
	public boolean canUse() {
		if (!(this.yorkie.level() instanceof ServerLevel level) || !this.canFight(level) || level.getGameTime() < this.nextSearchTick) {
			return false;
		}

		this.nextSearchTick = level.getGameTime() + THREAT_SEARCH_INTERVAL_TICKS;
		this.target = this.findTarget(level);
		return this.target != null;
	}

	@Override
	public boolean canContinueToUse() {
		return this.yorkie.level() instanceof ServerLevel level
				&& this.canFight(level)
				&& this.target != null
				&& this.target.isAlive()
				&& this.yorkie.canAttack(this.target)
				&& this.yorkie.distanceToSqr(this.target) < THREAT_TRACK_DISTANCE_SQR;
	}

	@Override
	public boolean requiresUpdateEveryTick() {
		return true;
	}

	@Override
	public void start() {
		this.yorkie.setSleeping(false);
		this.nextMoveTick = 0;
		MushroomYorkieSounds.bark(this.yorkie);
		MushroomBehaviorDebugger.debug(this.yorkie, "hostile_start", "hostile: noticed " + this.targetName(), true);
	}

	@Override
	public void stop() {
		MushroomBehaviorDebugger.debug(this.yorkie, "hostile_stop", "hostile: stopped tracking threat", true);
		this.target = null;
		this.retreatTicks = 0;
		this.yorkie.getNavigation().stop();
	}

	@Override
	public void tick() {
		if (this.target == null || !(this.yorkie.level() instanceof ServerLevel level)) {
			return;
		}

		Player player = this.yorkie.trust.playerToStayNear(this.yorkie, level);
		this.yorkie.getLookControl().setLookAt(this.target, 10.0F, this.yorkie.getMaxHeadXRot());
		if (this.retreatTicks > 0) {
			this.retreatTicks--;
			MushroomBehaviorDebugger.debug(this.yorkie, "hostile_retreat", "hostile: retreating after a tiny attack", false);
			this.moveBehindPlayer(player);
			return;
		}

		if (this.nextMoveTick-- <= 0 || this.yorkie.getNavigation().isDone()) {
			this.yorkie.getNavigation().moveTo(this.target, 1.15D);
			this.nextMoveTick = 12;
		}
		MushroomBehaviorDebugger.debug(this.yorkie, "hostile_approach", "hostile: approaching " + this.targetName(), false);

		if (this.yorkie.tickCount % 45 == 0) {
			MushroomYorkieSounds.bark(this.yorkie);
		}

		if (this.yorkie.distanceToSqr(this.target) <= 2.2D && this.yorkie.getSensing().hasLineOfSight(this.target)) {
			this.yorkie.swing(InteractionHand.MAIN_HAND);
			MushroomHostileCombat.attack(this.yorkie, level, this.target);
			MushroomBehaviorDebugger.debug(this.yorkie, "hostile_attack", "hostile: nipped " + this.targetName(), true);
			this.retreatTicks = 45 + this.yorkie.getRandom().nextInt(25);
			this.nextMoveTick = 0;
		}
	}

	private boolean canFight(ServerLevel level) {
		return this.yorkie.isTame()
				&& !this.yorkie.isOrderedToSit()
				&& !this.yorkie.isNoGravity()
				&& !MushroomNightBehavior.shouldAskToGoOutside(this.yorkie, level);
	}

	private Monster findTarget(ServerLevel level) {
		double radius = MushroomYorkieEntity.HOSTILE_MOB_SEARCH_RADIUS;
		AABB area = new AABB(this.yorkie.position(), this.yorkie.position()).inflate(radius, 5.0D, radius);
		Monster closest = null;
		double closestDistance = radius * radius;
		// Wake on sound through a wall. Normal pathfinding and line of sight govern the approach and bite.
		for (Monster monster : level.getEntitiesOfClass(Monster.class, area, mob -> mob.isAlive() && this.yorkie.canAttack(mob))) {
			double distance = this.yorkie.distanceToSqr(monster);
			if (distance < closestDistance) {
				closest = monster;
				closestDistance = distance;
			}
		}

		return closest;
	}

	private void moveBehindPlayer(Player player) {
		if (player == null) {
			Vec3 away = this.yorkie.position().subtract(this.target.position());
			this.moveToward(this.yorkie.position().add(MushroomMovementPolicy.normalizedHorizontal(away).scale(4.0D)), 1.25D);
			return;
		}

		Vec3 behind = player.position()
				.subtract(player.getLookAngle().multiply(4.0D, 0.0D, 4.0D))
				.add((this.yorkie.getRandom().nextDouble() - 0.5D) * 2.0D, 0.0D, (this.yorkie.getRandom().nextDouble() - 0.5D) * 2.0D);
		this.moveToward(behind, 1.3D);
	}

	private void moveToward(Vec3 target, double speed) {
		if (this.nextMoveTick-- > 0 && !this.yorkie.getNavigation().isDone()) {
			return;
		}

		this.yorkie.getNavigation().moveTo(target.x, target.y, target.z, speed);
		this.nextMoveTick = 18;
	}

	private String targetName() {
		return this.target == null ? "nothing" : this.target.getName().getString();
	}
}
