package dev.alicon.mushroomyorkie.entity;

import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.tags.BlockTags;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.Vec3;

final class MushroomExpeditionFooting {
	private MushroomExpeditionFooting() {
	}

	static boolean standable(ServerLevel level, MushroomYorkieEntity dog, BlockPos pos) {
		if (!level.hasChunkAt(pos)) {
			return false;
		}
		var floor = pos.below();
		var floorState = level.getBlockState(floor);
		var feet = level.getBlockState(pos);
		return floorState.isFaceSturdy(level, floor, Direction.UP) && !floorState.is(Blocks.MAGMA_BLOCK)
				&& !floorState.is(Blocks.CAMPFIRE) && !floorState.is(Blocks.SOUL_CAMPFIRE)
				&& feet.getFluidState().isEmpty() && !feet.is(BlockTags.FIRE) && !feet.is(Blocks.POWDER_SNOW)
				&& level.noCollision(dog, dog.getBoundingBox().move(Vec3.atBottomCenterOf(pos).subtract(dog.position())));
	}

	static boolean unsafeStep(ServerLevel level, BlockPos from, BlockPos to) {
		if (!level.hasChunkAt(to)) {
			return true;
		}
		if (dangerousBlock(level, to) || dangerousBlock(level, to.below())) {
			return true;
		}
		int dx = to.getX() - from.getX();
		int dz = to.getZ() - from.getZ();
		if (dx == 0 && dz == 0) {
			return false;
		}
		int sideX = Math.abs(dx) >= Math.abs(dz) ? 0 : 1;
		int sideZ = sideX == 0 ? 1 : 0;
		return exposedSide(level, to.offset(sideX, 0, sideZ)) && exposedSide(level, to.offset(-sideX, 0, -sideZ));
	}

	private static boolean exposedSide(ServerLevel level, BlockPos side) {
		if (!level.hasChunkAt(side)) {
			return true;
		}
		for (int drop = 0; drop <= 3; drop++) {
			BlockPos pos = side.below(drop);
			var state = level.getBlockState(pos);
			if (dangerousBlock(level, pos)) {
				return true;
			}
			if (!state.getCollisionShape(level, pos).isEmpty()) {
				return false;
			}
		}
		return true;
	}

	private static boolean dangerousBlock(ServerLevel level, BlockPos pos) {
		var state = level.getBlockState(pos);
		return state.getFluidState().is(net.minecraft.tags.FluidTags.LAVA) || state.is(BlockTags.FIRE)
				|| state.is(Blocks.MAGMA_BLOCK) || state.is(Blocks.POWDER_SNOW)
				|| state.is(Blocks.CAMPFIRE) || state.is(Blocks.SOUL_CAMPFIRE);
	}
}
