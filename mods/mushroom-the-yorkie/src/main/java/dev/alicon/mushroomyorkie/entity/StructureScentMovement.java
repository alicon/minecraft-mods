package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.MushroomStructureScentConfig;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.phys.Vec3;

final class StructureScentMovement {
	private static final int MOVE_RETRY_TICKS = 28;

	private final MushroomYorkieEntity yorkie;
	private int nextMoveTick;
	private int circleStep;

	StructureScentMovement(MushroomYorkieEntity yorkie) {
		this.yorkie = yorkie;
	}

	void reset() {
		this.nextMoveTick = 0;
		this.circleStep = 0;
	}

	void tickRecovery(Player owner, MushroomStructureScentConfig config) {
		this.yorkie.getLookControl().setLookAt(owner, 10.0F, this.yorkie.getMaxHeadXRot());
		barkOnInterval(config);
		if (!readyToMove()) {
			return;
		}

		Vec3 center = owner.position();
		double angle = ++this.circleStep * (Math.PI / 3.0D);
		Vec3 target = center.add(Math.cos(angle) * 2.0D, 0.0D, Math.sin(angle) * 2.0D);
		this.yorkie.getNavigation().moveTo(target.x, target.y, target.z, 0.9D);
		this.nextMoveTick = MOVE_RETRY_TICKS;
	}

	void waitForOwner(Player owner, MushroomStructureScentConfig config) {
		this.yorkie.getNavigation().stop();
		this.yorkie.getLookControl().setLookAt(owner, 10.0F, this.yorkie.getMaxHeadXRot());
		barkOnInterval(config);
	}

	boolean leadOwner(ServerLevel level, Player owner, StructureScent scent, MushroomStructureScentConfig config) {
		this.yorkie.getLookControl().setLookAt(scent.pos().getX(), scent.pos().getY(), scent.pos().getZ());
		barkOnInterval(config);
		if (!readyToMove()) {
			return false;
		}

		Vec3 lead = StructureScentPolicy.leadPoint(owner.position(), scent.pos(), config.leadAheadBlocks());
		BlockPos ground = StructureScentTerrain.groundPos(level, this.yorkie, lead);
		boolean moving = this.yorkie.getNavigation().moveTo(ground.getX() + 0.5D, ground.getY(), ground.getZ() + 0.5D, 1.2D);
		this.nextMoveTick = MOVE_RETRY_TICKS;
		return !moving;
	}

	int circleBackToOwner(
			ServerLevel level,
			Player owner,
			StructureScent scent,
			MushroomStructureScentConfig config,
			int circleBackTicks
	) {
		circleBackTicks--;
		this.yorkie.getLookControl().setLookAt(owner, 10.0F, this.yorkie.getMaxHeadXRot());
		barkOnInterval(config);
		if (!readyToMove()) {
			return circleBackTicks;
		}

		Vec3 target = StructureScentPolicy.circleBackPoint(owner.position(), scent.pos(), config.circleBackDistanceBlocks());
		BlockPos ground = StructureScentTerrain.groundPos(level, this.yorkie, target);
		this.yorkie.getNavigation().moveTo(ground.getX() + 0.5D, ground.getY(), ground.getZ() + 0.5D, 1.3D);
		this.nextMoveTick = 16;
		if (circleBackTicks <= 0 || this.yorkie.distanceToSqr(owner) <= square(config.circleBackDistanceBlocks() + 2.0D)) {
			this.nextMoveTick = 0;
			return 0;
		}
		return circleBackTicks;
	}

	private boolean readyToMove() {
		return this.nextMoveTick-- <= 0 || this.yorkie.getNavigation().isDone();
	}

	private void barkOnInterval(MushroomStructureScentConfig config) {
		if (this.yorkie.tickCount % config.barkIntervalTicks() == 0) {
			MushroomYorkieSounds.bark(this.yorkie);
		}
	}

	private static double square(double value) {
		return value * value;
	}
}
