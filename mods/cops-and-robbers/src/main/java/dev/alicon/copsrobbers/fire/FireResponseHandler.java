package dev.alicon.copsrobbers.fire;

import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.phys.shapes.CollisionContext;

/** Shared fire-response behavior for cops, firemen, and fire trucks. */
public final class FireResponseHandler {
	private FireResponseHandler() {
	}

	/** Walks a mob toward nearby fire and extinguishes it when close enough. */
	public static boolean tryExtinguishNearby(PathfinderMob mob, ServerLevel level, int radius) {
		BlockPos fire = nearestFire(level, mob.blockPosition(), radius);
		if (fire == null) {
			return false;
		}
		if (fire.distSqr(mob.blockPosition()) <= 3.5D * 3.5D) {
			extinguish(level, fire);
		} else {
			mob.getNavigation().moveTo(fire.getX() + 0.5D, fire.getY(), fire.getZ() + 0.5D, 1.15D);
		}
		return true;
	}

	/** Extinguishes fires in a small cone ahead of a vehicle. */
	public static boolean sprayWater(ServerLevel level, BlockPos origin, double dirX, double dirZ, int length, int width) {
		boolean extinguished = false;
		Vec3 nozzle = Vec3.atCenterOf(origin);
		double len = Math.max(0.001D, Math.sqrt(dirX * dirX + dirZ * dirZ));
		double forwardX = dirX / len;
		double forwardZ = dirZ / len;
		double sideX = -forwardZ;
		double sideZ = forwardX;
		for (int step = 2; step <= length; step++) {
			for (int side = -width; side <= width; side++) {
				BlockPos center = origin.offset((int) Math.round(forwardX * step + sideX * side), 0, (int) Math.round(forwardZ * step + sideZ * side));
				for (BlockPos pos : BlockPos.betweenClosed(center.below(), center.above(3))) {
					if (level.getBlockState(pos).is(Blocks.FIRE) && level.clip(new ClipContext(
							nozzle, Vec3.atCenterOf(pos), ClipContext.Block.COLLIDER, ClipContext.Fluid.NONE,
							CollisionContext.empty())).getType() == HitResult.Type.MISS) {
						extinguish(level, pos);
						extinguished = true;
					}
				}
			}
		}
		return extinguished;
	}

	private static BlockPos nearestFire(ServerLevel level, BlockPos center, int radius) {
		BlockPos nearest = null;
		double nearestDistance = Double.MAX_VALUE;
		for (BlockPos pos : BlockPos.betweenClosed(center.offset(-radius, -2, -radius), center.offset(radius, 5, radius))) {
			if (!level.getBlockState(pos).is(Blocks.FIRE)) {
				continue;
			}
			double distance = pos.distSqr(center);
			if (distance < nearestDistance) {
				nearest = pos.immutable();
				nearestDistance = distance;
			}
		}
		return nearest;
	}

	private static void extinguish(ServerLevel level, BlockPos pos) {
		level.setBlock(pos, Blocks.AIR.defaultBlockState(), 3);
		level.playSound(null, pos, SoundEvents.FIRE_EXTINGUISH, SoundSource.NEUTRAL, 0.7F, 1.1F);
	}
}
