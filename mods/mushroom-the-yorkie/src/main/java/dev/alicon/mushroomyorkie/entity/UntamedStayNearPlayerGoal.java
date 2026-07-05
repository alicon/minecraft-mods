package dev.alicon.mushroomyorkie.entity;

import java.util.EnumSet;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.phys.Vec3;

final class UntamedStayNearPlayerGoal extends Goal {
	private final MushroomYorkieEntity yorkie;
	private Player player;
	private int nextMoveTick;

	UntamedStayNearPlayerGoal(MushroomYorkieEntity yorkie) {
		this.yorkie = yorkie;
		this.setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK));
	}

	@Override
	public boolean canUse() {
		if (!(this.yorkie.level() instanceof ServerLevel level) || this.yorkie.isTame() || this.yorkie.isMushroomSleeping()) {
			return false;
		}

		this.player = this.yorkie.playerToStayNear(level);
		if (this.player == null) {
			return false;
		}

		double distance = this.yorkie.distanceToSqr(this.player);
		return this.yorkie.scaredRunTicks > 0
				|| this.yorkie.wasScoldedToday(level)
				|| distance > MushroomYorkieEntity.UNTAMED_PLAYER_RETURN_RADIUS * MushroomYorkieEntity.UNTAMED_PLAYER_RETURN_RADIUS
				|| distance < MushroomYorkieEntity.UNTAMED_PLAYER_TOO_CLOSE_RADIUS * MushroomYorkieEntity.UNTAMED_PLAYER_TOO_CLOSE_RADIUS;
	}

	@Override
	public boolean canContinueToUse() {
		return this.canUse();
	}

	@Override
	public boolean requiresUpdateEveryTick() {
		return true;
	}

	@Override
	public void start() {
		this.nextMoveTick = 0;
		MushroomBehaviorDebugger.debug(this.yorkie, "untamed_start", "untamed: choosing distance from player", true);
	}

	@Override
	public void tick() {
		if (this.player == null || !(this.yorkie.level() instanceof ServerLevel level)) {
			return;
		}

		this.yorkie.getLookControl().setLookAt(this.player, 8.0F, this.yorkie.getMaxHeadXRot());
		MushroomBehaviorDebugger.debug(this.yorkie, this.debugState(level), this.debugDetail(level), false);
		if (this.nextMoveTick-- > 0 && !this.yorkie.getNavigation().isDone()) {
			return;
		}

		Vec3 target = this.nextTarget(level);
		this.yorkie.getNavigation().moveTo(target.x, target.y, target.z, this.yorkie.wasScoldedToday(level) ? 1.35D : 0.95D);
		this.nextMoveTick = this.yorkie.wasScoldedToday(level) ? 16 : 45;
	}

	private Vec3 nextTarget(ServerLevel level) {
		Vec3 fromPlayer = this.yorkie.position().subtract(this.player.position());
		if (this.yorkie.wasScoldedToday(level)) {
			return this.player.position().add(MushroomMovementPolicy.normalizedHorizontal(fromPlayer).scale(MushroomYorkieEntity.UNTAMED_PLAYER_STICK_RADIUS));
		}

		double distance = this.yorkie.distanceToSqr(this.player);
		if (distance < MushroomYorkieEntity.UNTAMED_PLAYER_TOO_CLOSE_RADIUS * MushroomYorkieEntity.UNTAMED_PLAYER_TOO_CLOSE_RADIUS) {
			return this.player.position().add(MushroomMovementPolicy.normalizedHorizontal(fromPlayer).scale(MushroomYorkieEntity.UNTAMED_PLAYER_RETURN_RADIUS));
		}

		double angle = this.yorkie.getRandom().nextDouble() * Math.PI * 2.0D;
		double radius = 5.0D + this.yorkie.getRandom().nextDouble() * 3.0D;
		return this.player.position().add(Math.cos(angle) * radius, 0.0D, Math.sin(angle) * radius);
	}

	private String debugState(ServerLevel level) {
		if (this.yorkie.scaredRunTicks > 0 || this.yorkie.wasScoldedToday(level)) {
			return "untamed_scared";
		}

		return this.playerTooClose()
				? "untamed_too_close"
				: "untamed_curious";
	}

	private String debugDetail(ServerLevel level) {
		if (this.yorkie.scaredRunTicks > 0 || this.yorkie.wasScoldedToday(level)) {
			return "untamed: keeping extra distance after being scared";
		}

		return this.playerTooClose()
				? "untamed: player is too close, backing up"
				: "untamed: drifting near player";
	}

	private boolean playerTooClose() {
		double tooClose = MushroomYorkieEntity.UNTAMED_PLAYER_TOO_CLOSE_RADIUS;
		return this.yorkie.distanceToSqr(this.player) < tooClose * tooClose;
	}
}
