package dev.alicon.copsrobbers.bank;

import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.world.Container;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.ChestBlock;

/** Verifies theft targets against real block states and chest inventories. */
public final class BankVaultGameTests {
	/** A plain chest cannot qualify as a vault or contribute to its arson radius. */
	@GameTest
	public void ordinaryChestKeepsItsGold(GameTestHelper helper) {
		BlockPos relative = new BlockPos(3, 2, 3);
		Container chest = stockedChest(helper, relative);
		BlockPos worldPos = helper.absolutePos(relative);
		helper.assertTrue(!BankVaults.stealGoldFromVaultChest(helper.getLevel(), worldPos), "Robber took private storage gold");
		helper.assertTrue(chest.getItem(0).getCount() == 4, "Ordinary chest lost an ingot");
		helper.assertTrue(!BankVaults.nearVaultChest(helper.getLevel(), worldPos), "Plain chest looked like a vault");
		helper.succeed();
	}

	/** The rear bar wall from existing kits still identifies a real stocked vault. */
	@GameTest
	public void existingVaultStillLosesOneIngot(GameTestHelper helper) {
		BlockPos relative = new BlockPos(3, 2, 3);
		Container chest = stockedChest(helper, relative);
		Container plain = stockedChest(helper, relative.west(2));
		helper.setBlock(relative.south(), Blocks.IRON_BARS);
		helper.setBlock(relative.south().above(), Blocks.IRON_BARS);
		BlockPos worldPos = helper.absolutePos(relative);
		helper.assertTrue(BankVaults.nearVaultChest(helper.getLevel(), worldPos), "Legacy vault did not qualify");
		helper.assertTrue(BankVaults.stealGoldFromVaultChest(helper.getLevel(), worldPos), "Legacy vault was not robbed");
		helper.assertTrue(chest.getItem(0).getCount() == 3, "Vault should lose exactly one ingot");
		helper.assertTrue(plain.getItem(0).getCount() == 4, "Nearby ordinary chest lost an ingot");
		helper.succeed();
	}

	private static Container stockedChest(GameTestHelper helper, BlockPos relative) {
		helper.setBlock(relative, Blocks.CHEST.defaultBlockState().setValue(ChestBlock.FACING, Direction.NORTH));
		Container chest = (Container) helper.getLevel().getBlockEntity(helper.absolutePos(relative));
		chest.setItem(0, new ItemStack(Items.GOLD_INGOT, 4));
		return chest;
	}
}
