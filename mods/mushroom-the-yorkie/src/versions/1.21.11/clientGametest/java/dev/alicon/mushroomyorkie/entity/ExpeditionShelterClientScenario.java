package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.item.ModItems;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerContext;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.world.level.block.BedBlock;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.DoorBlock;
import net.minecraft.world.level.block.state.properties.BedPart;
import net.minecraft.world.level.block.state.properties.DoubleBlockHalf;
import net.minecraft.world.level.entity.EntityTypeTest;

final class ExpeditionShelterClientScenario {
	private ExpeditionShelterClientScenario() {
	}

	static void run(ClientGameTestContext context, TestServerContext server, UUID ownerId, Path status) throws IOException {
		BlockPos door = server.computeOnServer(minecraft -> {
			var level = minecraft.overworld();
			var owner = minecraft.getPlayerList().getPlayer(ownerId);
			var entry = owner.blockPosition().above(6);
			for (BlockPos pos : BlockPos.betweenClosed(entry.offset(-6, -1, -3), entry.offset(5, -1, 3))) {
				level.setBlockAndUpdate(pos, Blocks.OAK_PLANKS.defaultBlockState());
			}
			for (BlockPos pos : BlockPos.betweenClosed(entry.offset(-6, 0, -3), entry.offset(5, 4, 3))) {
				level.setBlockAndUpdate(pos, Blocks.AIR.defaultBlockState());
			}
			for (int x = 0; x <= 4; x++) {
				for (int z = -2; z <= 2; z++) {
					level.setBlockAndUpdate(entry.offset(x, 3, z), Blocks.OAK_PLANKS.defaultBlockState());
					if (x > 0 && x < 4 && Math.abs(z) < 2 || x == 0 && z == 0) continue;
					for (int y = 0; y < 3; y++) {
						level.setBlockAndUpdate(entry.offset(x, y, z), Blocks.OAK_PLANKS.defaultBlockState());
					}
				}
			}
			var gate = Blocks.OAK_DOOR.defaultBlockState().setValue(DoorBlock.FACING, Direction.EAST);
			level.setBlock(entry, gate.setValue(DoorBlock.HALF, DoubleBlockHalf.LOWER), Block.UPDATE_CLIENTS);
			level.setBlock(entry.above(), gate.setValue(DoorBlock.HALF, DoubleBlockHalf.UPPER), Block.UPDATE_CLIENTS);
			var bed = Blocks.RED_BED.defaultBlockState().setValue(BedBlock.FACING, Direction.EAST);
			level.setBlock(entry.east(2), bed.setValue(BedBlock.PART, BedPart.FOOT), Block.UPDATE_CLIENTS);
			level.setBlock(entry.east(3), bed.setValue(BedBlock.PART, BedPart.HEAD), Block.UPDATE_CLIENTS);
			owner.teleportTo(entry.getX() - 3.5, entry.getY(), entry.getZ() + 0.5);
			level.setDayTime(13_300);
			return entry;
		});
		context.waitFor(client -> client.player.blockPosition().equals(door.west(4))
				&& client.level.getBlockState(door).is(Blocks.OAK_DOOR));
		Files.writeString(status, "ready");
		boolean sleptInside = false;
		for (int tick = 0; tick < 1_000; tick += 5) {
			String result = Files.readString(status);
			sleptInside |= server.computeOnServer(minecraft -> {
				var owner = minecraft.getPlayerList().getPlayer(ownerId);
				return owner.isSleeping() && owner.blockPosition().getX() > door.getX()
						&& !minecraft.overworld().getBlockState(door).getValue(DoorBlock.OPEN);
			});
			if ("finished".equals(result)) {
				if (!sleptInside) throw new AssertionError("Expected native sleep inside the closed shelter");
				server.runOnServer(minecraft -> {
					var owner = minecraft.getPlayerList().getPlayer(ownerId);
					var dogs = minecraft.overworld().getEntities(EntityTypeTest.forClass(MushroomYorkieEntity.class),
							dog -> dog.isAlive() && dog.belongsTo(owner));
					if (owner.isSleeping() || minecraft.overworld().getDayTime() < 24_000 || dogs.size() != 1
							|| !owner.getInventory().contains(stack -> stack.is(ModItems.FIELD_GUIDE))) {
						throw new AssertionError("Expected a living adopted dog and guide after sleeping at the sheltered bed");
					}
					System.out.printf("Expedition sheltered adoption passed: dog=%s owner=%s%n", dogs.getFirst().getUUID(), ownerId);
				});
				context.takeScreenshot("expedition-survival-sheltered-adoption");
				return;
			}
			if ("failed".equals(result)) break;
			context.waitTicks(5);
		}
		throw new AssertionError("The sheltered Java adoption did not finish");
	}
}
