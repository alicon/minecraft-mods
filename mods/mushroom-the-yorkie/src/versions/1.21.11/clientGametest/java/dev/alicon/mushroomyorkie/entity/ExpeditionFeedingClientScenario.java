package dev.alicon.mushroomyorkie.entity;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Objects;
import java.util.UUID;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerContext;
import net.minecraft.core.BlockPos;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.Vec3;

final class ExpeditionFeedingClientScenario {
	private static final float STARTING_HEALTH = 7;

	private ExpeditionFeedingClientScenario() {
	}

	static void run(ClientGameTestContext context, TestServerContext server, UUID ownerId, Path status) throws IOException {
		var fixture = server.computeOnServer(minecraft -> {
			var level = minecraft.overworld();
			var owner = minecraft.getPlayerList().getPlayer(ownerId);
			var camp = owner.blockPosition().above(7);
			for (BlockPos pos : BlockPos.betweenClosed(camp.offset(-3, -1, -3), camp.offset(14, -1, 3))) {
				level.setBlockAndUpdate(pos, Blocks.GRASS_BLOCK.defaultBlockState());
			}
			for (BlockPos pos : BlockPos.betweenClosed(camp.offset(-3, 0, -3), camp.offset(14, 3, 3))) {
				level.setBlockAndUpdate(pos, Blocks.AIR.defaultBlockState());
			}
			level.setDayTime(1_000);
			owner.teleportTo(camp.getX() + 0.5, camp.getY(), camp.getZ() + 0.5);
			owner.getInventory().setItem(3, new ItemStack(Items.MUTTON, 2));
			var dog = Objects.requireNonNull(ModEntities.MUSHROOM_YORKIE.create(level, EntitySpawnReason.TRIGGERED));
			dog.claimFor(owner);
			dog.setPos(Vec3.atBottomCenterOf(camp.east(7)));
			dog.setHealth(STARTING_HEALTH);
			level.addFreshEntity(dog);
			var sheep = Objects.requireNonNull(EntityType.SHEEP.create(level, EntitySpawnReason.TRIGGERED));
			sheep.setPos(Vec3.atBottomCenterOf(camp.east(12)));
			sheep.setNoAi(true);
			level.addFreshEntity(sheep);
			return new Fixture(camp, sheep.blockPosition(), dog.getUUID(), dog.getId());
		});
		context.waitFor(client -> client.player.blockPosition().equals(fixture.camp())
				&& client.player.getInventory().contains(stack -> stack.is(Items.MUTTON))
				&& client.level.getEntity(fixture.runtimeId()) instanceof MushroomYorkieEntity);
		boolean chasing = false;
		for (int tick = 0; tick < 80; tick++) {
			chasing = server.computeOnServer(minecraft -> {
				var dog = (MushroomYorkieEntity) minecraft.overworld().getEntity(fixture.dogId());
				return dog != null && fixture.sheepPos().equals(dog.getNavigation().getTargetPos())
						&& !dog.getNavigation().isDone();
			});
			if (chasing) break;
			context.waitTick();
		}
		if (!chasing) throw new AssertionError("Feeding fixture never observed Mushroom chasing the sheep");
		Files.writeString(status.resolveSibling("feeding-companion"), fixture.dogId().toString());
		Files.writeString(status, "ready");
		for (int tick = 0; tick < 750; tick += 5) {
			String result = Files.readString(status);
			if ("finished".equals(result)) {
				server.runOnServer(minecraft -> {
					var owner = minecraft.getPlayerList().getPlayer(ownerId);
					var dog = (MushroomYorkieEntity) minecraft.overworld().getEntity(fixture.dogId());
					int mutton = owner.getInventory().countItem(Items.MUTTON);
					if (dog == null || !dog.isAlive() || !dog.isOwnedBy(owner) || dog.getHealth() <= STARTING_HEALTH || mutton != 1) {
						throw new AssertionError("Expected the original dog to heal and exactly one portion of mutton to be consumed");
					}
					if (!owner.blockPosition().equals(fixture.camp())) {
						throw new AssertionError("The owner chased the dog instead of bringing him back to camp");
					}
					System.out.printf("Expedition native feeding passed: dog=%s health=%.1f mutton=%d%n",
							dog.getUUID(), dog.getHealth(), mutton);
				});
				context.takeScreenshot("expedition-survival-feeding");
				return;
			}
			if ("failed".equals(result)) break;
			context.waitTicks(5);
		}
		throw new AssertionError("The controller did not complete native feeding at camp");
	}

	private record Fixture(BlockPos camp, BlockPos sheepPos, UUID dogId, int runtimeId) {
	}
}
