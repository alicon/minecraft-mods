package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.block.ModBlocks;
import dev.alicon.mushroomyorkie.item.ModItems;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Objects;
import java.util.UUID;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerContext;
import net.minecraft.core.BlockPos;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;

final class ExpeditionGearClientScenario {
	private ExpeditionGearClientScenario() {
	}

	static void run(ClientGameTestContext context, TestServerContext server, UUID ownerId, Path status) throws IOException {
		var fixture = server.computeOnServer(minecraft -> {
			var owner = Objects.requireNonNull(minecraft.getPlayerList().getPlayer(ownerId));
			var level = minecraft.overworld();
			var landing = owner.blockPosition().above(6);
			for (BlockPos pos : BlockPos.betweenClosed(landing.offset(-5, -1, -5), landing.offset(5, -1, 5))) {
				level.setBlockAndUpdate(pos, Blocks.COBBLESTONE.defaultBlockState());
			}
			for (BlockPos pos : BlockPos.betweenClosed(landing.offset(-5, 0, -5), landing.offset(5, 3, 5))) {
				level.setBlockAndUpdate(pos, Blocks.AIR.defaultBlockState());
			}
			level.setBlockAndUpdate(landing.east(2), Blocks.CRAFTING_TABLE.defaultBlockState());
			owner.teleportTo(landing.getX() + 0.5, landing.getY(), landing.getZ() + 0.5);
			owner.getInventory().add(new ItemStack(Items.LEATHER, 3));
			owner.getInventory().add(new ItemStack(Items.STRING, 5));
			owner.getInventory().add(new ItemStack(Items.WHITE_WOOL, 2));
			owner.getInventory().add(new ItemStack(Items.BLACK_WOOL, 2));
			owner.getInventory().add(new ItemStack(Items.INK_SAC));
			var dog = Objects.requireNonNull(ModEntities.MUSHROOM_YORKIE.create(level, EntitySpawnReason.TRIGGERED));
			dog.claimFor(owner);
			dog.setNoAi(true);
			dog.setPos(landing.getX() + 0.5, landing.getY(), landing.getZ() - 2);
			level.addFreshEntity(dog);
			return new Fixture(landing, dog.getUUID(), dog.getId());
		});
		context.waitFor(client -> client.player.blockPosition().equals(fixture.landing())
				&& client.player.getInventory().contains(stack -> stack.is(Items.INK_SAC))
				&& client.level.getEntity(fixture.runtimeId()) instanceof MushroomYorkieEntity);
		Files.writeString(status.resolveSibling("gear-companion"), fixture.dogId().toString());
		Files.writeString(status, "ready");
		boolean sawStay = false;
		for (int tick = 0; tick < 1_600; tick += 3) {
			String result = Files.readString(status);
			sawStay |= server.computeOnServer(minecraft ->
					((MushroomYorkieEntity) minecraft.overworld().getEntity(fixture.dogId())).isOrderedToSit());
			if ("finished".equals(result)) {
				if (!sawStay) throw new AssertionError("The controller never asked the dog to stay");
				server.runOnServer(minecraft -> {
					var owner = minecraft.getPlayerList().getPlayer(ownerId);
					var level = minecraft.overworld();
					var dog = (MushroomYorkieEntity) level.getEntity(fixture.dogId());
					if (dog == null || !dog.isAlive() || !dog.belongsTo(owner)
							|| !dog.hasHarness() || !dog.hasExpeditionVest() || dog.isOrderedToSit()) {
						throw new AssertionError("Expected the original dog wearing the crafted harness and vest, back in follow mode");
					}
					var anchor = dog.expeditionCamp.anchor();
					if (anchor == null || !anchor.dimension().equals(Level.OVERWORLD)
							|| !level.getBlockState(anchor.pos()).is(ModBlocks.CAMP_MAT)
							|| owner.getInventory().contains(stack -> stack.is(ModItems.CAMP_MAT)
									|| stack.is(ModItems.PADDED_VEST) || stack.is(ModItems.YORKIE_HARNESS))) {
						throw new AssertionError("Expected the crafted equipment to be used and a real mat to be marked as camp");
					}
				});
				context.takeScreenshot("expedition-survival-companion-equipment");
				System.out.printf("Expedition companion equipment passed: dog=%s owner=%s%n", fixture.dogId(), ownerId);
				return;
			}
			if ("failed".equals(result)) break;
			context.waitTicks(3);
		}
		throw new AssertionError("The companion equipment controller did not finish crafting, fitting and marking");
	}

	private record Fixture(BlockPos landing, UUID dogId, int runtimeId) {
	}
}
