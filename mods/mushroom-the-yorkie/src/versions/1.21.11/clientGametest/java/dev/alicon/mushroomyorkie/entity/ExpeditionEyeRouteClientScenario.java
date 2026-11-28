package dev.alicon.mushroomyorkie.entity;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerContext;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.stats.Stats;
import net.minecraft.tags.StructureTags;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.block.Blocks;

final class ExpeditionEyeRouteClientScenario {
	private ExpeditionEyeRouteClientScenario() {
	}

	static void run(ClientGameTestContext context, TestServerContext server, UUID ownerId, Path status, boolean locate) throws IOException {
		int distance = locate ? Integer.parseInt(System.getenv().getOrDefault("MUSHROOM_EXPEDITION_STRONGHOLD_DISTANCE", "54")) : 0;
		if (locate && (distance < 36 || distance > 600)) {
			throw new AssertionError("Set the stronghold fixture distance between 36 and 600 blocks");
		}
		var fixture = server.computeOnServer(minecraft -> {
			var owner = Objects.requireNonNull(minecraft.getPlayerList().getPlayer(ownerId));
			var level = minecraft.overworld();
			// Independently verify the direction against the world's real structure.
			// Only the dog's UUID is passed to the player controller.
			var origin = owner.blockPosition().immutable();
			var approach = locate ? findLandApproach(level, origin, distance) : new Approach(origin.above(8), Objects.requireNonNull(
					level.findNearestMapStructure(StructureTags.EYE_OF_ENDER_LOCATED, origin, 100, false)));
			var stronghold = approach.stronghold();
			var start = approach.start();
			if (!locate) {
				for (BlockPos pos : BlockPos.betweenClosed(start.offset(-15, -1, -15), start.offset(15, -1, 15))) {
					level.setBlockAndUpdate(pos, Blocks.COBBLESTONE.defaultBlockState());
				}
				for (BlockPos pos : BlockPos.betweenClosed(start.offset(-15, 0, -15), start.offset(15, 3, 15))) {
					level.setBlockAndUpdate(pos, Blocks.AIR.defaultBlockState());
				}
			}
			if (locate) level.setDayTime(1_000);
			owner.teleportTo(start.getX() + 0.5, start.getY(), start.getZ() + 0.5);
			owner.getInventory().add(new ItemStack(Items.ENDER_EYE, locate ? 11 : 1));
			if (locate) {
				owner.getInventory().add(new ItemStack(Items.ENDER_PEARL));
				owner.getInventory().add(new ItemStack(Items.BLAZE_POWDER));
				owner.getInventory().add(new ItemStack(Items.COOKED_MUTTON, 8));
			}
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
		for (int tick = 0; tick < (locate ? Math.max(5_000, 34 * distance) : 1_600); tick += 5) {
			String result = Files.readString(status);
			if ("finished".equals(result)) {
				server.runOnServer(minecraft -> {
					var owner = minecraft.getPlayerList().getPlayer(ownerId);
					var start = fixture.start();
					var stronghold = fixture.stronghold();
					double remaining = distance(owner.getX(), owner.getZ(), stronghold);
					double gain = distance(start.getX() + 0.5, start.getZ() + 0.5, stronghold) - remaining;
					boolean proof = locate ? gain >= 25 && remaining <= 12
								&& owner.getStats().getValue(Stats.ITEM_CRAFTED.get(Items.ENDER_EYE)) == 1
							&& owner.getStats().getValue(Stats.ITEM_USED.get(Items.ENDER_EYE)) >= 2
							: !owner.getInventory().contains(stack -> stack.is(Items.ENDER_EYE));
					if (!owner.isAlive() || !owner.level().dimension().equals(Level.OVERWORLD) || gain < 7
							|| !(owner.level().getEntity(fixture.dogId()) instanceof MushroomYorkieEntity dog)
							|| !dog.isAlive() || !dog.belongsTo(owner) || dog.distanceTo(owner) > 16
							|| !proof) {
						throw new AssertionError("Expected the owner and original dog to reach the checked stronghold approach; gain="
								+ gain + ", remaining=" + remaining);
					}
					System.out.printf("Expedition native %s passed: dog=%s owner=%s advance=%.2f remaining=%.2f%n",
							locate ? "stronghold approach" : "eye route", fixture.dogId(), ownerId, gain, remaining);
				});
				context.takeScreenshot(locate ? "expedition-survival-stronghold-approach" : "expedition-survival-eye-route");
				return;
			}
			if ("failed".equals(result)) break;
			context.waitTicks(5);
		}
		throw new AssertionError("The controller did not advance toward the observed Eye of Ender bearing");
	}

	private static Approach findLandApproach(ServerLevel level, BlockPos origin, int distance) {
		var examined = new HashSet<BlockPos>();
		for (BlockPos probe : List.of(origin, origin.east(2500), origin.south(2500), origin.west(2500), origin.north(2500))) {
			var stronghold = level.findNearestMapStructure(StructureTags.EYE_OF_ENDER_LOCATED, probe, 100, false);
			if (stronghold == null || !examined.add(stronghold.immutable()) || drySurface(level, stronghold) == null) continue;
			for (Direction direction : Direction.Plane.HORIZONTAL) {
				for (int side : new int[] { 0, 12, -12 }) {
					var column = stronghold.relative(direction, distance).relative(direction.getClockWise(), side);
					var start = drySurface(level, column);
					if (start != null) return new Approach(start, stronghold);
				}
			}
		}
		throw new AssertionError("No generated stronghold with a dry surface approach was found");
	}

	private static BlockPos drySurface(ServerLevel level, BlockPos column) {
		var chunk = level.getChunk(column.getX() >> 4, column.getZ() >> 4);
		int y = chunk.getHeight(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, column.getX() & 15, column.getZ() & 15) + 1;
		var pos = new BlockPos(column.getX(), y, column.getZ());
		var floor = pos.below();
		var head = pos.above();
		var ground = chunk.getBlockState(floor);
		var feetState = chunk.getBlockState(pos);
		var headState = chunk.getBlockState(head);
		System.out.printf("Expedition verifier sampled generated surface at %s over %s, feet=%s head=%s%n",
				pos, ground.getBlock(), feetState.getBlock(), headState.getBlock());
		return feetState.getCollisionShape(level, pos).isEmpty() && headState.getCollisionShape(level, head).isEmpty()
				&& feetState.getFluidState().isEmpty() && headState.getFluidState().isEmpty()
				&& ground.isFaceSturdy(level, floor, Direction.UP) && ground.getFluidState().isEmpty()
				&& (ground.is(Blocks.GRASS_BLOCK) || ground.is(Blocks.DIRT) || ground.is(Blocks.STONE) || ground.is(Blocks.SAND))
				? pos : null;
	}

	private static double distance(double x, double z, BlockPos target) {
		return Math.hypot(x - target.getX() - 0.5, z - target.getZ() - 0.5);
	}

	private record Fixture(BlockPos start, BlockPos stronghold, UUID dogId, int runtimeId) {
	}

	private record Approach(BlockPos start, BlockPos stronghold) {
	}
}
