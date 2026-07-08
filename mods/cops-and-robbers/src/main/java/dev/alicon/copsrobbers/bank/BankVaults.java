package dev.alicon.copsrobbers.bank;

import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.Container;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.block.Blocks;

final class BankVaults {
	private static final int VAULT_SCAN_XZ = 8;
	private static final int VAULT_SCAN_DOWN = 2;
	private static final int VAULT_SCAN_UP = 3;

	private BankVaults() {
	}

	static boolean stealGoldFromVaultChest(ServerLevel level, BlockPos center) {
		for (BlockPos pos : BlockPos.betweenClosed(
				center.offset(-VAULT_SCAN_XZ, -VAULT_SCAN_DOWN, -VAULT_SCAN_XZ),
				center.offset(VAULT_SCAN_XZ, VAULT_SCAN_UP, VAULT_SCAN_XZ)
		)) {
			if (!level.getBlockState(pos).is(Blocks.CHEST) || !(level.getBlockEntity(pos) instanceof Container container)) {
				continue;
			}
			if (stealGold(container)) {
				return true;
			}
		}
		return false;
	}

	static boolean nearVaultChest(ServerLevel level, BlockPos center) {
		for (BlockPos pos : BlockPos.betweenClosed(
				center.offset(-VAULT_SCAN_XZ, -VAULT_SCAN_DOWN, -VAULT_SCAN_XZ),
				center.offset(VAULT_SCAN_XZ, VAULT_SCAN_UP, VAULT_SCAN_XZ)
		)) {
			if (level.getBlockState(pos).is(Blocks.CHEST)) {
				return true;
			}
		}
		return false;
	}

	private static boolean stealGold(Container container) {
		for (int slot = 0; slot < container.getContainerSize(); slot++) {
			ItemStack stack = container.getItem(slot);
			if (!stack.isEmpty() && stack.is(Items.GOLD_INGOT)) {
				stack.shrink(1);
				container.setChanged();
				return true;
			}
		}
		return false;
	}
}
