package dev.alicon.copsrobbers.entity;

import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.level.block.Blocks;

final class BankRobberArsonHandler {
	private static final int ARSON_RETRY_TICKS = 100;
	private static final int ARSON_CHANCE_PER_TICK = 120;
	private static final int ARSON_SEARCH_RADIUS = 3;

	private BankRobberArsonHandler() {
	}

	static void tick(BankRobberEntity robber, ServerLevel level) {
		if (robber.isJailed()
				|| !BankRobberSchedulePolicy.isDaytime(level.getDayTime())
				|| robber.arsonCooldown-- > 0
				|| robber.getRandom().nextInt(ARSON_CHANCE_PER_TICK) != 0) {
			return;
		}

		robber.arsonCooldown = ARSON_RETRY_TICKS;
		BlockPos around = robber.blockPosition().offset(
				robber.getRandom().nextInt(ARSON_SEARCH_RADIUS * 2 + 1) - ARSON_SEARCH_RADIUS,
				0,
				robber.getRandom().nextInt(ARSON_SEARCH_RADIUS * 2 + 1) - ARSON_SEARCH_RADIUS
		);
		BlockPos firePos = around.above();
		if (level.isCloseToVillage(robber.blockPosition(), 3)
				&& level.isEmptyBlock(firePos)
				&& Blocks.FIRE.defaultBlockState().canSurvive(level, firePos)) {
			level.setBlock(firePos, Blocks.FIRE.defaultBlockState(), 3);
			level.playSound(null, firePos, SoundEvents.FLINTANDSTEEL_USE, SoundSource.HOSTILE, 0.7F, 0.8F);
		}
	}
}
