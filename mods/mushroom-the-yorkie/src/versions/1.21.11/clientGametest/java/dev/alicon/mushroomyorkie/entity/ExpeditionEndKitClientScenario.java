package dev.alicon.mushroomyorkie.entity;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Objects;
import java.util.UUID;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerContext;
import net.minecraft.core.BlockPos;
import net.minecraft.stats.Stats;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.Vec3;

final class ExpeditionEndKitClientScenario {
	private ExpeditionEndKitClientScenario() {
	}

	static void run(ClientGameTestContext context, TestServerContext server, UUID ownerId, Path status) throws IOException {
		var fixture = server.computeOnServer(minecraft -> {
			var owner = Objects.requireNonNull(minecraft.getPlayerList().getPlayer(ownerId));
			var level = minecraft.overworld();
			var start = owner.blockPosition().above(8);
			for (BlockPos pos : BlockPos.betweenClosed(start.offset(-6, -1, -6), start.offset(6, -1, 6))) {
				level.setBlockAndUpdate(pos, Blocks.STONE.defaultBlockState());
				for (int y = 1; y <= 3; y++) level.setBlockAndUpdate(pos.above(y), Blocks.AIR.defaultBlockState());
			}
			for (BlockPos pos : BlockPos.betweenClosed(start.offset(4, -1, -1), start.offset(5, -1, 0))) {
				level.setBlockAndUpdate(pos.below(), Blocks.STONE.defaultBlockState());
				level.setBlockAndUpdate(pos, Blocks.WATER.defaultBlockState());
			}
			var table = start.west(2);
			level.setBlockAndUpdate(table, Blocks.CRAFTING_TABLE.defaultBlockState());
			var position = Vec3.atBottomCenterOf(start);
			owner.teleportTo(position.x, position.y, position.z);
			owner.getInventory().add(new ItemStack(Items.IRON_SWORD));
			owner.getInventory().add(new ItemStack(Items.WATER_BUCKET));
			owner.getInventory().add(new ItemStack(Items.BUCKET));
			owner.getInventory().add(new ItemStack(Items.COBBLESTONE, 40));
			owner.getInventory().add(new ItemStack(Items.FURNACE));
			owner.getInventory().add(new ItemStack(Items.OAK_PLANKS, 18));
			owner.getInventory().add(new ItemStack(Items.STRING, 3));
			owner.getInventory().add(new ItemStack(Items.FLINT, 3));
			owner.getInventory().add(new ItemStack(Items.FEATHER, 2));
			owner.getInventory().add(new ItemStack(Items.MUTTON, 4));
			for (int offset = -3; offset <= 3; offset++) {
				var chicken = Objects.requireNonNull(EntityType.CHICKEN.create(level, EntitySpawnReason.TRIGGERED));
				chicken.setNoAi(true);
				chicken.setPos(Vec3.atBottomCenterOf(start.offset(offset, 0, 3)));
				level.addFreshEntity(chicken);
			}
			var dog = Objects.requireNonNull(ModEntities.MUSHROOM_YORKIE.create(level, EntitySpawnReason.TRIGGERED));
			dog.claimFor(owner);
			dog.setPos(Vec3.atBottomCenterOf(start.north(2)));
			level.addFreshEntity(dog);
			return new Start(start, dog.getUUID(), dog.getId());
		});
		context.waitFor(client -> client.player.blockPosition().equals(fixture.position())
				&& client.level.getEntity(fixture.runtimeId()) instanceof MushroomYorkieEntity);
		Files.writeString(status.resolveSibling("end-kit-companion"), fixture.dogId().toString());
		Files.writeString(status, "ready");
		for (int tick = 0; tick < 3_600; tick += 5) {
			String result = Files.readString(status);
			if ("failed".equals(result)) break;
			if ("finished".equals(result)) {
				server.runOnServer(minecraft -> {
					var owner = minecraft.getPlayerList().getPlayer(ownerId);
					var inventory = owner.getInventory();
					var stats = owner.getStats();
					var dog = minecraft.overworld().getEntity(fixture.dogId());
					if (!(dog instanceof MushroomYorkieEntity yorkie) || !yorkie.isAlive() || !yorkie.belongsTo(owner)
							|| inventory.countItem(Items.BOW) != 1 || inventory.countItem(Items.ARROW) < 12
							|| inventory.countItem(Items.WATER_BUCKET) != 2 || inventory.countItem(Items.COOKED_MUTTON) < 3
							|| stats.getValue(Stats.ENTITY_KILLED.get(EntityType.CHICKEN)) == 0
							|| stats.getValue(Stats.ITEM_CRAFTED.get(Items.BOW)) == 0
							|| stats.getValue(Stats.ITEM_CRAFTED.get(Items.ARROW)) < 12) {
						throw new AssertionError("Expected native hunting, crafting, cooking, water collection and the original dog");
					}
				});
				context.takeScreenshot("expedition-survival-end-kit");
				System.out.printf("Expedition earned End kit passed: dog=%s owner=%s%n", fixture.dogId(), ownerId);
				return;
			}
			context.waitTicks(5);
		}
		throw new AssertionError("The End combat kit was not prepared");
	}

	private record Start(BlockPos position, UUID dogId, int runtimeId) {
	}
}
