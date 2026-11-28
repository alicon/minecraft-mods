package dev.alicon.mushroomyorkie.entity;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerContext;
import net.minecraft.core.BlockPos;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.Vec3;

final class ExpeditionIronClientScenario {
	private ExpeditionIronClientScenario() {
	}

	static void run(ClientGameTestContext context, TestServerContext server, UUID ownerId, Path status) throws IOException {
		var fixture = server.computeOnServer(minecraft -> {
			var level = minecraft.overworld();
			var owner = minecraft.getPlayerList().getPlayer(ownerId);
			var start = owner.blockPosition().above(12);
			for (BlockPos pos : BlockPos.betweenClosed(start.offset(-5, -1, -4), start.offset(0, -1, 4))) {
				level.setBlockAndUpdate(pos, Blocks.STONE.defaultBlockState());
			}
			for (BlockPos pos : BlockPos.betweenClosed(start.offset(-5, 0, -4), start.offset(4, 3, 4))) {
				level.setBlockAndUpdate(pos, Blocks.AIR.defaultBlockState());
			}
			for (BlockPos pos : BlockPos.betweenClosed(start.east().below(2), start.east().above())) {
				level.setBlockAndUpdate(pos, Blocks.STONE.defaultBlockState());
			}
			level.setBlockAndUpdate(start.east().above(), Blocks.LEAF_LITTER.defaultBlockState());
			// The pocket is beside the stair. The lookahead beyond the stair
			// sees open air, so the controller must stay over the checked floor.
			for (BlockPos pos : BlockPos.betweenClosed(start.offset(1, -2, -4), start.offset(6, -2, 5))) {
				if (!(pos.getZ() == start.getZ() && pos.getX() >= start.getX() + 2)) {
					level.setBlockAndUpdate(pos, Blocks.STONE.defaultBlockState());
				}
			}
			var ores = List.of(start.offset(1, -1, 2), start.offset(1, 0, 2), start.offset(1, 1, 2),
					start.offset(2, -1, 2), start.offset(2, 0, 2), start.offset(3, -1, 1), start.offset(3, 0, 1));
			for (BlockPos ore : ores) level.setBlockAndUpdate(ore, Blocks.IRON_ORE.defaultBlockState());
			level.setDayTime(1_000);
			owner.teleportTo(start.getX() + 0.69, start.getY(), start.getZ() + 0.5);
			owner.getInventory().add(new ItemStack(Items.STONE_PICKAXE));
			owner.getInventory().add(new ItemStack(Items.FURNACE));
			owner.getInventory().add(new ItemStack(Items.OAK_PLANKS, 16));
			owner.getInventory().add(new ItemStack(Items.STICK, 2));
			owner.getInventory().add(new ItemStack(Items.COAL, 2));
			var dog = Objects.requireNonNull(ModEntities.MUSHROOM_YORKIE.create(level, EntitySpawnReason.TRIGGERED));
			dog.claimFor(owner);
			dog.setPos(Vec3.atBottomCenterOf(start.west(3)));
			dog.setMushroomOrderedToSit(true);
			level.addFreshEntity(dog);
			return new Fixture(start, ores, dog.getUUID(), dog.getId());
		});
		context.waitFor(client -> client.player.blockPosition().equals(fixture.start())
				&& client.player.getInventory().contains(stack -> stack.is(Items.STONE_PICKAXE))
				&& client.level.getEntity(fixture.runtimeId()) instanceof MushroomYorkieEntity);
		var bed = fixture.start().west(5);
		Files.writeString(status.resolveSibling("quarry-iron-fixture"),
				"{\"dog\":\"%s\",\"bed\":[%d,%d,%d]}".formatted(fixture.dogId(), bed.getX(), bed.getY(), bed.getZ()));
		Files.writeString(status, "ready");
		boolean descended = false;
		for (int tick = 0; tick < 3_600; tick += 5) {
			String result = Files.readString(status);
			descended |= server.computeOnServer(minecraft -> minecraft.getPlayerList().getPlayer(ownerId).getY() < fixture.start().getY());
			if ("finished".equals(result)) {
				if (!descended) throw new AssertionError("The native player never descended below camp");
				server.runOnServer(minecraft -> {
					var owner = minecraft.getPlayerList().getPlayer(ownerId);
					var inventory = owner.getInventory();
					var level = minecraft.overworld();
					var dog = (MushroomYorkieEntity) level.getEntity(fixture.dogId());
					if (!owner.isAlive() || owner.getY() < fixture.start().getY()
							|| !inventory.contains(stack -> stack.is(Items.IRON_PICKAXE))
							|| !inventory.contains(stack -> stack.is(Items.BUCKET))
							|| !owner.getOffhandItem().is(Items.SHIELD)
							|| !fixture.ores().stream().allMatch(pos -> level.getBlockState(pos).isAir())
							|| dog == null || !dog.isAlive() || !dog.isOwnedBy(owner)
							|| !dog.isOrderedToSit() || !dog.blockPosition().equals(fixture.start().west(3))) {
						throw new AssertionError("Expected all iron earned and the owner and original dog safe at camp");
					}
				});
				context.takeScreenshot("expedition-survival-quarry-iron");
				System.out.println("Expedition native quarry iron passed: grounded descent, seven mined and smelted ore, original dog at camp");
				return;
			}
			if ("failed".equals(result)) break;
			context.waitTicks(5);
		}
		throw new AssertionError("The controller did not complete the native quarry iron replay");
	}

	private record Fixture(BlockPos start, List<BlockPos> ores, UUID dogId, int runtimeId) {
	}
}
