package dev.alicon.mushroomyorkie.entity;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerContext;
import net.minecraft.core.BlockPos;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.block.Blocks;

final class ExpeditionQuarryToolsClientScenario {
	private ExpeditionQuarryToolsClientScenario() {
	}

	static void run(ClientGameTestContext context, TestServerContext server, UUID ownerId, Path status) throws IOException {
		var origin = server.computeOnServer(minecraft -> {
			var owner = minecraft.getPlayerList().getPlayer(ownerId);
			var level = minecraft.overworld();
			var start = owner.blockPosition().above(7);
			for (BlockPos pos : BlockPos.betweenClosed(start.offset(-4, -1, -4), start.offset(4, -1, 4))) {
				level.setBlockAndUpdate(pos, Blocks.COBBLESTONE.defaultBlockState());
			}
			for (BlockPos pos : BlockPos.betweenClosed(start.offset(-4, 0, -4), start.offset(4, 3, 4))) {
				level.setBlockAndUpdate(pos, Blocks.AIR.defaultBlockState());
			}
			level.setBlockAndUpdate(start.north(2), Blocks.DIRT.defaultBlockState());
			level.setBlockAndUpdate(start.east(2), Blocks.STONE.defaultBlockState());
			owner.teleportTo(start.getX() + 0.5, start.getY(), start.getZ() + 0.5);
			owner.getInventory().add(new ItemStack(Items.OAK_LOG, 4));
			return start;
		});
		context.waitFor(client -> client.player.blockPosition().equals(origin)
				&& client.player.getInventory().contains(stack -> stack.is(Items.OAK_LOG)));
		var dirt = origin.north(2);
		var stone = origin.east(2);
		Files.writeString(status.resolveSibling("quarry-tool-targets"),
				"[[%d,%d,%d],[%d,%d,%d]]".formatted(dirt.getX(), dirt.getY(), dirt.getZ(), stone.getX(), stone.getY(), stone.getZ()));
		Files.writeString(status, "ready");
		for (int tick = 0; tick < 1_600; tick += 5) {
			String result = Files.readString(status);
			if ("finished".equals(result)) {
				server.runOnServer(minecraft -> {
					var inventory = minecraft.getPlayerList().getPlayer(ownerId).getInventory();
					if (!minecraft.overworld().getBlockState(dirt).isAir() || !minecraft.overworld().getBlockState(stone).isAir()
							|| !inventory.contains(stack -> stack.is(Items.WOODEN_SHOVEL) && stack.getDamageValue() == 1)
							|| !inventory.contains(stack -> stack.is(Items.WOODEN_PICKAXE) && stack.getDamageValue() == 1)
							|| !inventory.contains(stack -> stack.is(Items.WOODEN_SWORD))) {
						throw new AssertionError("Expected native crafting and one use on each correctly selected tool");
					}
				});
				context.takeScreenshot("expedition-survival-quarry-tools");
				System.out.println("Expedition native quarry tools passed: shovel damage=1 pickaxe damage=1");
				return;
			}
			if ("failed".equals(result)) break;
			context.waitTicks(5);
		}
		throw new AssertionError("The controller did not finish the native quarry tool replay");
	}
}
