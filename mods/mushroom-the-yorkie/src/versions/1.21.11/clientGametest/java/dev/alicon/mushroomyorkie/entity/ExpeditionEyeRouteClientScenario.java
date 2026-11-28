package dev.alicon.mushroomyorkie.entity;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Objects;
import java.util.UUID;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerContext;
import net.minecraft.core.BlockPos;
import net.minecraft.tags.StructureTags;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;

final class ExpeditionEyeRouteClientScenario {
	private ExpeditionEyeRouteClientScenario() {
	}

	static void run(ClientGameTestContext context, TestServerContext server, UUID ownerId, Path status) throws IOException {
		var fixture = server.computeOnServer(minecraft -> {
			var owner = Objects.requireNonNull(minecraft.getPlayerList().getPlayer(ownerId));
			var level = minecraft.overworld();
			var start = owner.blockPosition().above(8);
			// Independently verify the direction against the world's real structure.
			// Only the dog's UUID is passed to the player controller.
			var stronghold = Objects.requireNonNull(level.findNearestMapStructure(StructureTags.EYE_OF_ENDER_LOCATED, start, 100, false));
			for (BlockPos pos : BlockPos.betweenClosed(start.offset(-15, -1, -15), start.offset(15, -1, 15))) {
				level.setBlockAndUpdate(pos, Blocks.COBBLESTONE.defaultBlockState());
			}
			for (BlockPos pos : BlockPos.betweenClosed(start.offset(-15, 0, -15), start.offset(15, 3, 15))) {
				level.setBlockAndUpdate(pos, Blocks.AIR.defaultBlockState());
			}
			owner.teleportTo(start.getX() + 0.5, start.getY(), start.getZ() + 0.5);
			owner.getInventory().add(new ItemStack(Items.ENDER_EYE));
			var dog = Objects.requireNonNull(ModEntities.MUSHROOM_YORKIE.create(level, EntitySpawnReason.TRIGGERED));
			dog.claimFor(owner);
			dog.setPos(start.getX() + 1.5, start.getY(), start.getZ() + 0.5);
			level.addFreshEntity(dog);
			return new Fixture(start, stronghold.immutable(), dog.getUUID(), dog.getId());
		});
		context.waitFor(client -> client.player.blockPosition().equals(fixture.start())
				&& client.player.getInventory().contains(stack -> stack.is(Items.ENDER_EYE))
				&& client.level.getEntity(fixture.runtimeId()) instanceof MushroomYorkieEntity);
		Files.writeString(status.resolveSibling("eye-companion"), fixture.dogId().toString());
		Files.writeString(status, "ready");
		for (int tick = 0; tick < 1_600; tick += 5) {
			String result = Files.readString(status);
			if ("finished".equals(result)) {
				server.runOnServer(minecraft -> {
					var owner = minecraft.getPlayerList().getPlayer(ownerId);
					var start = fixture.start();
					var stronghold = fixture.stronghold();
					double gain = distance(start.getX() + 0.5, start.getZ() + 0.5, stronghold)
							- distance(owner.getX(), owner.getZ(), stronghold);
					if (!owner.isAlive() || !owner.level().dimension().equals(Level.OVERWORLD) || gain < 7
							|| !(owner.level().getEntity(fixture.dogId()) instanceof MushroomYorkieEntity dog)
							|| !dog.isAlive() || !dog.belongsTo(owner) || dog.distanceTo(owner) > 16
							|| owner.getInventory().contains(stack -> stack.is(Items.ENDER_EYE))) {
						throw new AssertionError("Expected the owner and original dog to advance toward the real stronghold after using the eye; gain=" + gain);
					}
					System.out.printf("Expedition native eye route passed: dog=%s owner=%s advance=%.2f%n", fixture.dogId(), ownerId, gain);
				});
				context.takeScreenshot("expedition-survival-eye-route");
				return;
			}
			if ("failed".equals(result)) break;
			context.waitTicks(5);
		}
		throw new AssertionError("The controller did not advance toward the observed Eye of Ender bearing");
	}

	private static double distance(double x, double z, BlockPos target) {
		return Math.hypot(x - target.getX() - 0.5, z - target.getZ() - 0.5);
	}

	private record Fixture(BlockPos start, BlockPos stronghold, UUID dogId, int runtimeId) {
	}
}
