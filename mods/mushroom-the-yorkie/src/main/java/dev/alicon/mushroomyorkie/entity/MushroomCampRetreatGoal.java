package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.block.ModBlocks;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.List;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.AreaEffectCloud;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.entity.boss.enderdragon.EnderDragon;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.pathfinder.Path;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

final class MushroomCampRetreatGoal extends Goal {
	private static final int CAMP_RANGE = 24;
	private static final int SEARCH_RANGE = 5;
	private static final int MAX_FALLBACK_PATHS = 8;
	private static final int REPLAN_TICKS = 12;

	private final MushroomYorkieEntity dog;
	private BlockPos destination;
	private boolean headingToCamp;
	private int replanTicks;

	MushroomCampRetreatGoal(MushroomYorkieEntity dog) {
		this.dog = dog;
		this.setFlags(EnumSet.of(Flag.MOVE, Flag.JUMP));
	}

	@Override
	public boolean canUse() {
		if (!(this.dog.level() instanceof ServerLevel level) || !this.dog.isTame() || this.dog.isOrderedToSit()
				|| this.dog.isInWater() || this.dog.isPassenger() || this.dog.isLeashed()
				|| MushroomYorkieStateQueries.ownerIsCreative(this.dog)) {
			return false;
		}
		var camp = this.dog.expeditionCamp;
		boolean onMagma = this.dog.onGround() && level.getBlockState(this.dog.getOnPos()).is(Blocks.MAGMA_BLOCK);
		boolean danger = onMagma || (camp.anchor() != null && this.dog.hurtTime > 0)
				|| inBreath(this.breathAt(level), this.dog.position());
		if (!camp.holding()) {
			return danger;
		}
		BlockPos mat = this.campIn(level);
		if (!danger && this.dog.getOwner() instanceof Player owner && owner.isAlive() && this.dog.distanceToSqr(owner) <= 4
				&& (mat == null || this.at(mat))) {
			camp.setHolding(false);
			return false;
		}
		return true;
	}

	@Override
	public boolean canContinueToUse() {
		return this.dog.expeditionCamp.holding() && this.canUse();
	}

	@Override
	public void start() {
		if (!this.dog.expeditionCamp.holding()) {
			this.dog.expeditionCamp.setHolding(true);
			MushroomYorkieSounds.bark(this.dog);
			if (this.dog.getOwner() instanceof Player owner) {
				MushroomCampInteractions.notice(owner, "camp_retreat");
			}
		}
		this.dog.setSleeping(false);
		this.replanTicks = 0;
	}

	@Override
	public void stop() {
		this.destination = null;
		this.dog.getNavigation().stop();
	}

	@Override
	public void tick() {
		if (!(this.dog.level() instanceof ServerLevel level)) {
			return;
		}
		var breath = this.breathAt(level);
		BlockPos camp = this.campIn(level);
		if (this.destination != null && (!this.headingToCamp || this.destination.equals(camp))
				&& this.isSafe(level, this.destination, breath)) {
			if (this.at(this.destination)) {
				this.dog.getNavigation().stop();
			}
			if (--this.replanTicks > 0) {
				return;
			}
		}
		this.replanTicks = REPLAN_TICKS;
		this.destination = null;
		this.dog.getNavigation().stop();
		if (camp != null && this.tryReach(level, camp, breath)) {
			this.headingToCamp = true;
			return;
		}
		this.headingToCamp = false;
		this.holdAtSafeFooting(level, breath);
	}

	private void holdAtSafeFooting(ServerLevel level, List<AreaEffectCloud> breath) {
		BlockPos center = this.dog.blockPosition();
		if (this.isSafe(level, center, breath)) {
			this.destination = center;
			return;
		}
		List<BlockPos> alternatives = new ArrayList<>();
		for (BlockPos pos : BlockPos.betweenClosed(center.offset(-SEARCH_RANGE, -1, -SEARCH_RANGE),
				center.offset(SEARCH_RANGE, 1, SEARCH_RANGE))) {
			if (this.isSafe(level, pos, breath)) {
				alternatives.add(pos.immutable());
			}
		}
		alternatives.sort(Comparator.comparingDouble(pos -> this.dog.distanceToSqr(Vec3.atBottomCenterOf(pos))));
		for (int i = 0; i < Math.min(MAX_FALLBACK_PATHS, alternatives.size()); i++) {
			if (this.tryReach(level, alternatives.get(i), breath)) {
				return;
			}
		}
	}

	private boolean tryReach(ServerLevel level, BlockPos pos, List<AreaEffectCloud> breath) {
		if (!this.isSafe(level, pos, breath)) {
			return false;
		}
		if (!this.at(pos)) {
			Path path = this.dog.getNavigation().createPath(pos, 0);
			if (path == null || !path.canReach() || !this.safeRoute(level, path) || !this.dog.getNavigation().moveTo(path, 1.25D)) {
				return false;
			}
		}
		this.destination = pos;
		return true;
	}

	private boolean safeRoute(ServerLevel level, Path path) {
		BlockPos previous = this.dog.blockPosition();
		for (int node = 0; node < path.getNodeCount(); node++) {
			BlockPos step = path.getNode(node).asBlockPos();
			if (!previous.equals(step) && MushroomExpeditionFooting.unsafeStep(level, previous, step)) {
				return false;
			}
			previous = step;
		}
		return true;
	}

	private BlockPos campIn(ServerLevel level) {
		var mark = this.dog.expeditionCamp.anchor();
		if (mark == null || !mark.dimension().equals(level.dimension())
				|| !mark.pos().closerThan(this.dog.blockPosition(), CAMP_RANGE)
				|| !level.hasChunkAt(mark.pos()) || !level.getBlockState(mark.pos()).is(ModBlocks.CAMP_MAT)) {
			return null;
		}
		return mark.pos();
	}

	private boolean at(BlockPos pos) {
		return this.dog.distanceToSqr(Vec3.atBottomCenterOf(pos)) <= 0.64;
	}

	private boolean isSafe(ServerLevel level, BlockPos pos, List<AreaEffectCloud> breath) {
		return MushroomExpeditionFooting.standable(level, this.dog, pos) && !inBreath(breath, Vec3.atBottomCenterOf(pos));
	}

	private List<AreaEffectCloud> breathAt(ServerLevel level) {
		if (!level.dimension().equals(Level.END)) {
			return List.of();
		}
		AABB area = this.dog.getBoundingBox().inflate(CAMP_RANGE + 6);
		return level.getEntitiesOfClass(AreaEffectCloud.class, area,
				cloud -> cloud.getOwner() instanceof EnderDragon);
	}

	private static boolean inBreath(List<AreaEffectCloud> clouds, Vec3 position) {
		for (AreaEffectCloud cloud : clouds) {
			double radius = cloud.getRadius() + 0.75;
			double dx = position.x - cloud.getX();
			double dz = position.z - cloud.getZ();
			if (Math.abs(position.y - cloud.getY()) < 2 && dx * dx + dz * dz <= radius * radius) {
				return true;
			}
		}
		return false;
	}
}
