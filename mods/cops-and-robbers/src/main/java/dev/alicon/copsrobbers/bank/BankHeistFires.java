package dev.alicon.copsrobbers.bank;

import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;

final class BankHeistFires {
	private static final int BANK_RADIUS = 9;

	private BankHeistFires() {
	}

	static void lightBankFire(ServerLevel level, BlockPos center) {
		for (BlockPos pos : BlockPos.betweenClosed(center.offset(-BANK_RADIUS, -1, -BANK_RADIUS), center.offset(BANK_RADIUS, 4, BANK_RADIUS))) {
			Block block = level.getBlockState(pos).getBlock();
			if (block == Blocks.OAK_PLANKS || block == Blocks.OAK_LOG || block == Blocks.WHITE_WOOL || block == Blocks.RED_CARPET) {
				BlockPos fire = pos.above();
				if (level.isEmptyBlock(fire) && Blocks.FIRE.defaultBlockState().canSurvive(level, fire)) {
					level.setBlock(fire, Blocks.FIRE.defaultBlockState(), 3);
					level.playSound(null, fire, SoundEvents.FLINTANDSTEEL_USE, SoundSource.HOSTILE, 0.8F, 0.8F);
					return;
				}
			}
		}
	}
}
