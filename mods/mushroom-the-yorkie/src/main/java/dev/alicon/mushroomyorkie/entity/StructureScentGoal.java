package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.MushroomStructureScentConfig;
import dev.alicon.mushroomyorkie.MushroomTheYorkie;
import java.util.EnumSet;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.tags.FluidTags;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.phys.Vec3;

final class StructureScentGoal extends Goal {
	private static final int FOLLOW_MESSAGE_TICKS = 120;
	private static final int DEBUG_MESSAGE_TICKS = 40;
	private static final int MOVE_RETRY_TICKS = 28;
	private static final int RECOVER_CLEAR_TICKS = 40;
	private static final int CELEBRATE_TICKS = 80;
	private static final int LOST_BLOCKED_TICKS = 60;
	private static final int VILLAGE_ARRIVAL_SCAN_RADIUS = 48;
	private static final int VILLAGE_ARRIVAL_SCAN_STEP = 16;

	private final MushroomYorkieEntity yorkie;
	private MushroomStructureScentConfig config;
	private StructureScent scent;
	private long nextSearchGameTime;
	private int nextMoveTick;
	private int nextMessageTick;
	private int nextDebugMessageTick;
	private int nextCircleBackTick;
	private int circleBackTicks;
	private int blockedTicks;
	private int clearTicks;
	private int recoveryTicks;
	private int celebrateTicks;
	private int circleStep;
	private boolean recovering;
	private boolean completed;

	StructureScentGoal(MushroomYorkieEntity yorkie) {
		this.yorkie = yorkie;
		this.setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK));
	}

	@Override
	public boolean canUse() {
		if (!(this.yorkie.level() instanceof ServerLevel level)) {
			return false;
		}

		this.config = MushroomTheYorkie.structureScentConfig();
		if (!this.canSniff(level) || level.getGameTime() < this.nextSearchGameTime) {
			return false;
		}

		this.nextSearchGameTime = level.getGameTime() + this.config.cooldownTicks();
		this.scent = StructureScentLocator.findNearest(level, this.yorkie.blockPosition(), this.config).orElse(null);
		return this.scent != null && !(this.yorkie.getOwner() instanceof Player owner && this.hasArrived(level, owner));
	}

	@Override
	public boolean canContinueToUse() {
		return !this.completed
				&& this.scent != null
				&& this.yorkie.level() instanceof ServerLevel level
				&& this.canSniff(level);
	}

	@Override
	public boolean requiresUpdateEveryTick() {
		return true;
	}

	@Override
	public void start() {
		this.nextMoveTick = 0;
		this.nextMessageTick = FOLLOW_MESSAGE_TICKS;
		this.nextDebugMessageTick = 0;
		this.nextCircleBackTick = this.config.circleBackIntervalTicks();
		this.circleBackTicks = 0;
		this.blockedTicks = 0;
		this.clearTicks = 0;
		this.recoveryTicks = 0;
		this.celebrateTicks = 0;
		this.circleStep = 0;
		this.recovering = false;
		this.completed = false;
		this.message("message.mushroom_yorkie.scent_start", true);
		this.debugState("start", "message.mushroom_yorkie.scent_debug_start", true);
		this.yorkie.bark();
	}

	@Override
	public void stop() {
		this.yorkie.getNavigation().stop();
		this.scent = null;
		this.recovering = false;
		this.completed = false;
	}

	@Override
	public void tick() {
		if (this.scent == null || !(this.yorkie.level() instanceof ServerLevel level) || !(this.yorkie.getOwner() instanceof Player owner)) {
			this.completed = true;
			return;
		}

		if (this.celebrateTicks > 0) {
			this.debugState("celebrating", "message.mushroom_yorkie.scent_debug_celebrating", false);
			this.tickCelebration(level);
			return;
		}

		if (this.hasArrived(level, owner)) {
			this.message("message.mushroom_yorkie.scent_arrived", true);
			this.yorkie.getNavigation().stop();
			this.celebrateTicks = CELEBRATE_TICKS;
			return;
		}

		if (this.tickTrailConfidence(level, owner)) {
			this.debugState("recovering", "message.mushroom_yorkie.scent_debug_recovering", false);
			this.tickRecovery(owner);
			return;
		}

		if (StructureScentPolicy.shouldWaitForOwner(this.yorkie.distanceToSqr(owner), this.config.leadAheadBlocks())) {
			if (StructureScentPolicy.shouldReturnToOwner(this.yorkie.distanceToSqr(owner), this.config.leadAheadBlocks())) {
				this.debugState("rejoining", "message.mushroom_yorkie.scent_debug_rejoining", false);
				this.message("message.mushroom_yorkie.scent_rejoining", false);
				this.circleBackTicks = Math.max(this.circleBackTicks, this.config.circleBackTicks());
				this.nextCircleBackTick = this.config.circleBackIntervalTicks();
				this.circleBackToOwner(level, owner);
				return;
			}

			this.debugState("waiting", "message.mushroom_yorkie.scent_debug_waiting", false);
			this.waitForOwner(owner);
			return;
		}

		if (this.shouldCircleBack(owner)) {
			this.circleBackTicks = this.config.circleBackTicks();
			this.nextCircleBackTick = this.config.circleBackIntervalTicks();
		}

		if (this.circleBackTicks > 0) {
			this.debugState("circling_back", "message.mushroom_yorkie.scent_debug_circling_back", false);
			this.circleBackToOwner(level, owner);
			return;
		}

		this.debugState("leading", "message.mushroom_yorkie.scent_debug_leading", false);
		this.leadOwner(level, owner);
	}

	private boolean canSniff(ServerLevel level) {
		LivingEntity owner = this.yorkie.getOwner();
		if (!(owner instanceof Player player)) {
			return false;
		}

		return this.config.enabled()
				&& this.yorkie.isTame()
				&& player.level() == this.yorkie.level()
				&& !player.isCreative()
				&& !this.yorkie.isOrderedToSit()
				&& !this.yorkie.isMushroomSleeping()
				&& !this.yorkie.shouldAskToGoOutside(level)
				&& this.yorkie.scaredRunTicks <= 0;
	}

	private boolean hasArrived(ServerLevel level, Player owner) {
		return StructureScentPolicy.withinDistance(this.yorkie.position(), this.scent.pos(), this.config.foundDistanceBlocks())
				|| StructureScentPolicy.withinDistance(owner.position(), this.scent.pos(), this.config.foundDistanceBlocks())
				|| this.scent.target() == StructureScentTarget.VILLAGE
				&& (this.nearVillage(level, this.yorkie.blockPosition()) || this.nearVillage(level, owner.blockPosition()));
	}

	private boolean nearVillage(ServerLevel level, BlockPos origin) {
		if (level.isVillage(origin)) {
			return true;
		}

		for (int dx = -VILLAGE_ARRIVAL_SCAN_RADIUS; dx <= VILLAGE_ARRIVAL_SCAN_RADIUS; dx += VILLAGE_ARRIVAL_SCAN_STEP) {
			for (int dz = -VILLAGE_ARRIVAL_SCAN_RADIUS; dz <= VILLAGE_ARRIVAL_SCAN_RADIUS; dz += VILLAGE_ARRIVAL_SCAN_STEP) {
				for (int dy = -VILLAGE_ARRIVAL_SCAN_STEP; dy <= VILLAGE_ARRIVAL_SCAN_STEP; dy += VILLAGE_ARRIVAL_SCAN_STEP) {
					BlockPos pos = origin.offset(dx, dy, dz);
					if (level.hasChunk(pos.getX() >> 4, pos.getZ() >> 4) && level.isVillage(pos)) {
						return true;
					}
				}
			}
		}
		return false;
	}

	private boolean tickTrailConfidence(ServerLevel level, Player owner) {
		boolean blocked = this.config.canLoseTrail() && this.trailBlocked(level, owner);
		if (blocked) {
			this.blockedTicks++;
			this.clearTicks = 0;
		} else {
			this.clearTicks++;
			if (!this.recovering) {
				this.blockedTicks = 0;
			}
		}

		if (!this.recovering && this.blockedTicks >= LOST_BLOCKED_TICKS) {
			this.recovering = true;
			this.recoveryTicks = this.config.recoveryTicks();
			this.message("message.mushroom_yorkie.scent_lost", false);
		}

		if (!this.recovering) {
			return false;
		}

		if (this.clearTicks >= RECOVER_CLEAR_TICKS) {
			this.recovering = false;
			this.blockedTicks = 0;
			this.message("message.mushroom_yorkie.scent_recovered", false);
			return false;
		}

		this.recoveryTicks--;
		if (this.recoveryTicks <= 0) {
			this.debugState("giving_up", "message.mushroom_yorkie.scent_debug_giving_up", true);
			this.completed = true;
		}
		return true;
	}

	private boolean trailBlocked(ServerLevel level, Player owner) {
		if (this.yorkie.level().getFluidState(this.yorkie.blockPosition()).is(FluidTags.WATER)
				|| owner.level().getFluidState(owner.blockPosition()).is(FluidTags.WATER)) {
			return true;
		}

		Vec3 lead = StructureScentPolicy.leadPoint(owner.position(), this.scent.pos(), this.config.leadAheadBlocks());
		BlockPos groundLead = this.groundPos(level, lead);
		if (Math.abs(groundLead.getY() - this.yorkie.blockPosition().getY()) > this.config.maxTrailRiseBlocks()) {
			return true;
		}

		return this.crossesWater(level, this.yorkie.position(), Vec3.atBottomCenterOf(groundLead));
	}

	private void tickRecovery(Player owner) {
		this.yorkie.getLookControl().setLookAt(owner, 10.0F, this.yorkie.getMaxHeadXRot());
		if (this.yorkie.tickCount % this.config.barkIntervalTicks() == 0) {
			this.yorkie.bark();
		}

		if (this.nextMoveTick-- > 0 && !this.yorkie.getNavigation().isDone()) {
			return;
		}

		Vec3 center = owner.position();
		double angle = ++this.circleStep * (Math.PI / 3.0D);
		Vec3 target = center.add(Math.cos(angle) * 2.0D, 0.0D, Math.sin(angle) * 2.0D);
		this.yorkie.getNavigation().moveTo(target.x, target.y, target.z, 0.9D);
		this.nextMoveTick = MOVE_RETRY_TICKS;
	}

	private void waitForOwner(Player owner) {
		this.yorkie.getNavigation().stop();
		this.yorkie.getLookControl().setLookAt(owner, 10.0F, this.yorkie.getMaxHeadXRot());
		this.message("message.mushroom_yorkie.scent_waiting", false);
		if (this.yorkie.tickCount % this.config.barkIntervalTicks() == 0) {
			this.yorkie.bark();
		}
	}

	private void leadOwner(ServerLevel level, Player owner) {
		this.yorkie.getLookControl().setLookAt(this.scent.pos().getX(), this.scent.pos().getY(), this.scent.pos().getZ());
		if (this.yorkie.tickCount % this.config.barkIntervalTicks() == 0) {
			this.yorkie.bark();
		}
		this.message("message.mushroom_yorkie.scent_follow", false);

		if (this.nextMoveTick-- > 0 && !this.yorkie.getNavigation().isDone()) {
			return;
		}

		Vec3 lead = StructureScentPolicy.leadPoint(owner.position(), this.scent.pos(), this.config.leadAheadBlocks());
		BlockPos ground = this.groundPos(level, lead);
		boolean moving = this.yorkie.getNavigation().moveTo(ground.getX() + 0.5D, ground.getY(), ground.getZ() + 0.5D, 1.2D);
		if (!moving && this.config.canLoseTrail()) {
			this.blockedTicks += 10;
		}
		this.nextMoveTick = MOVE_RETRY_TICKS;
	}

	private boolean shouldCircleBack(Player owner) {
		if (this.circleBackTicks > 0 || this.nextCircleBackTick-- > 0) {
			return false;
		}

		double closeEnough = this.config.circleBackDistanceBlocks() + 2.0D;
		return this.yorkie.distanceToSqr(owner) > closeEnough * closeEnough;
	}

	private void circleBackToOwner(ServerLevel level, Player owner) {
		this.circleBackTicks--;
		this.yorkie.getLookControl().setLookAt(owner, 10.0F, this.yorkie.getMaxHeadXRot());
		if (this.yorkie.tickCount % this.config.barkIntervalTicks() == 0) {
			this.yorkie.bark();
		}

		if (this.nextMoveTick-- > 0 && !this.yorkie.getNavigation().isDone()) {
			return;
		}

		Vec3 target = StructureScentPolicy.circleBackPoint(owner.position(), this.scent.pos(), this.config.circleBackDistanceBlocks());
		BlockPos ground = this.groundPos(level, target);
		this.yorkie.getNavigation().moveTo(ground.getX() + 0.5D, ground.getY(), ground.getZ() + 0.5D, 1.3D);
		this.nextMoveTick = 16;
		if (this.circleBackTicks <= 0 || this.yorkie.distanceToSqr(owner) <= square(this.config.circleBackDistanceBlocks() + 2.0D)) {
			this.circleBackTicks = 0;
			this.nextMoveTick = 0;
		}
	}

	private void tickCelebration(ServerLevel level) {
		this.celebrateTicks--;
		this.yorkie.getNavigation().stop();
		this.yorkie.setYRot(this.yorkie.getYRot() + 22.5F);
		this.yorkie.yBodyRot = this.yorkie.getYRot();
		this.yorkie.yHeadRot = this.yorkie.getYRot();
		this.yorkie.yRotO = this.yorkie.getYRot();
		if (this.celebrateTicks % 12 == 0) {
			this.yorkie.bark();
			this.yorkie.setDeltaMovement(this.yorkie.getDeltaMovement().add(0.0D, 0.16D, 0.0D));
			level.sendParticles(ParticleTypes.HEART, this.yorkie.getX(), this.yorkie.getY() + 0.5D, this.yorkie.getZ(), 3, 0.2D, 0.15D, 0.2D, 0.0D);
		}
		if (this.celebrateTicks <= 0) {
			this.completed = true;
		}
	}

	private BlockPos groundPos(ServerLevel level, Vec3 pos) {
		BlockPos column = BlockPos.containing(pos.x, this.yorkie.getY(), pos.z);
		return level.getHeightmapPos(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, column);
	}

	private boolean crossesWater(ServerLevel level, Vec3 start, Vec3 end) {
		Vec3 delta = end.subtract(start);
		int steps = Math.max(2, Math.min(12, (int) (delta.horizontalDistance() / 4.0D)));
		for (int index = 1; index <= steps; index++) {
			Vec3 sample = start.add(delta.scale(index / (double) steps));
			BlockPos ground = this.groundPos(level, sample);
			if (level.getFluidState(ground).is(FluidTags.WATER) || level.getFluidState(ground.below()).is(FluidTags.WATER)) {
				return true;
			}
		}
		return false;
	}

	private void message(String key, boolean immediate) {
		if (!this.config.messages() || !(this.yorkie.getOwner() instanceof Player owner)) {
			return;
		}
		if (!immediate && this.nextMessageTick-- > 0) {
			return;
		}

		this.nextMessageTick = FOLLOW_MESSAGE_TICKS;
		if (key.endsWith("start") || key.endsWith("arrived")) {
			MushroomOwnerNotice.send(this.yorkie, key, 0, Component.translatable(this.scent.target().descriptionKey()));
		} else {
			MushroomOwnerNotice.send(this.yorkie, key, 0);
		}
	}

	private void debugState(String state, String key, boolean immediate) {
		boolean debugEnabled = this.config.debugMessages() || MushroomTheYorkie.debugMessages();
		if (!debugEnabled || !(this.yorkie.getOwner() instanceof Player owner)) {
			return;
		}
		if (!immediate && this.nextDebugMessageTick-- > 0) {
			return;
		}

		this.nextDebugMessageTick = DEBUG_MESSAGE_TICKS;
		owner.displayClientMessage(Component.translatable(key, Component.translatable(this.scent.target().descriptionKey())), true);
		MushroomTheYorkie.LOGGER.info(
				"Mushroom scent debug: state={} target={} distanceToOwner={} blockedTicks={} recoveryTicks={} circleBackTicks={}",
				state,
				this.scent.target(),
				this.yorkie.getOwner() == null ? -1.0D : Math.sqrt(this.yorkie.distanceToSqr(this.yorkie.getOwner())),
				this.blockedTicks,
				this.recoveryTicks,
				this.circleBackTicks
		);
	}

	private static double square(double value) {
		return value * value;
	}
}
