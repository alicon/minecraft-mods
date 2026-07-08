package dev.alicon.copsrobbers.capture;

import dev.alicon.copsrobbers.entity.BankRobberEntity;
import dev.alicon.copsrobbers.entity.ModEntities;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.AABB;

final class PoliceJailbreakHandler {
	private PoliceJailbreakHandler() {
	}

	static void trigger(BankRobberEntity jailbreaker, ServerLevel level) {
		BlockPos center = jailbreaker.blockPosition();
		level.playSound(null, center, SoundEvents.GENERIC_EXPLODE.value(), SoundSource.HOSTILE, 0.9F, 0.8F);
		level.playSound(null, center, SoundEvents.BELL_BLOCK, SoundSource.PLAYERS, 1.0F, 1.8F);
		PoliceJailMessages.alertNearbyPlayers(level, center, Component.literal("The prison alarm is going off! Jailbreak!"));
		for (BankRobberEntity robber : level.getEntities(ModEntities.BANK_ROBBER, AABB.ofSize(center.getCenter(), 14.0D, 6.0D, 14.0D), BankRobberEntity::isJailed)) {
			robber.releaseFromJail();
		}
		messUpJail(level, center);
	}

	private static void messUpJail(ServerLevel level, BlockPos center) {
		int broken = 0;
		for (BlockPos pos : BlockPos.betweenClosed(center.offset(-3, 0, -3), center.offset(3, 3, 3))) {
			if (broken >= 12) {
				break;
			}
			BlockState state = level.getBlockState(pos);
			if ((state.is(Blocks.IRON_BARS) || isPoliceStationWall(state)) && level.random.nextInt(3) == 0) {
				level.destroyBlock(pos, false);
				broken++;
			}
		}

		BlockPos outside = center.relative(Direction.Plane.HORIZONTAL.getRandomDirection(level.random), 4);
		BlockPos floor = level.getHeightmapPos(net.minecraft.world.level.levelgen.Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, outside);
		level.setBlock(floor, Blocks.OAK_PLANKS.defaultBlockState(), 3);
		if (level.isEmptyBlock(floor.above()) && Blocks.FIRE.defaultBlockState().canSurvive(level, floor.above())) {
			level.setBlock(floor.above(), Blocks.FIRE.defaultBlockState(), 3);
		}
	}

	private static boolean isPoliceStationWall(BlockState state) {
		Block block = state.getBlock();
		return block == Blocks.QUARTZ_BLOCK || block == Blocks.SMOOTH_QUARTZ || block == Blocks.LIGHT_GRAY_CONCRETE;
	}
}
