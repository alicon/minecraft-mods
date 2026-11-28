package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.item.ModItems;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerContext;
import net.minecraft.core.BlockPos;
import net.minecraft.stats.Stats;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.boss.enderdragon.EndCrystal;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.Vec3;

final class ExpeditionEndCrystalClientScenario {
	private static final int ARROWS = 8;

	private ExpeditionEndCrystalClientScenario() {
	}

	static void run(ClientGameTestContext context, TestServerContext server, UUID ownerId, Path status) throws IOException {
		var fixture = server.computeOnServer(minecraft -> {
			var end = Objects.requireNonNull(minecraft.getLevel(Level.END));
			var start = new BlockPos(176, 90, 8);
			var shelter = start.west(2);
			var tower = start.offset(24, 12, 0);
			for (int x = (start.getX() - 5) >> 4; x <= tower.getX() >> 4; x++) {
				end.getChunk(x, start.getZ() >> 4);
			}
			for (BlockPos pos : BlockPos.betweenClosed(start.offset(-5, -1, -4), start.offset(5, -1, 4))) {
				end.setBlockAndUpdate(pos, Blocks.END_STONE.defaultBlockState());
			}
			for (BlockPos pos : BlockPos.betweenClosed(shelter.offset(-2, 4, -3), shelter.offset(2, 4, 3))) {
				end.setBlockAndUpdate(pos, Blocks.OBSIDIAN.defaultBlockState());
			}
			end.setBlockAndUpdate(tower.below(), Blocks.OBSIDIAN.defaultBlockState());
			var crystal = new EndCrystal(end, tower.getX() + 0.5, tower.getY(), tower.getZ() + 0.5);
			end.addFreshEntity(crystal);

			var owner = Objects.requireNonNull(minecraft.getPlayerList().getPlayer(ownerId));
			owner.teleportTo(end, start.getX() + 0.5, start.getY(), start.getZ() + 0.5, Set.of(), 0, 0, false);
			owner.getInventory().add(new ItemStack(Items.BOW));
			owner.getInventory().add(new ItemStack(Items.ARROW, ARROWS));
			owner.getInventory().add(new ItemStack(ModItems.CAMP_MAT));
			var dog = Objects.requireNonNull(ModEntities.MUSHROOM_YORKIE.create(end, EntitySpawnReason.TRIGGERED));
			dog.claimFor(owner);
			dog.setMushroomOrderedToSit(true);
			dog.setPos(Vec3.atBottomCenterOf(shelter));
			end.addFreshEntity(dog);
			return new Fixture(start, shelter, dog.getUUID(), dog.getHealth(), dog.getId(), crystal.getUUID(), crystal.getId());
		});
		context.waitFor(client -> client.screen == null && client.level.dimension().equals(Level.END)
				&& client.player.blockPosition().equals(fixture.start())
				&& client.level.getEntity(fixture.dogRuntimeId()) instanceof MushroomYorkieEntity
				&& client.level.getEntity(fixture.crystalRuntimeId()) instanceof EndCrystal);
		Files.writeString(status.resolveSibling("end-crystal-companion"), fixture.dogId().toString());
		Files.writeString(status, "ready");
		for (int tick = 0; tick < 1_200; tick += 5) {
			String result = Files.readString(status);
			if ("finished".equals(result)) {
				server.runOnServer(minecraft -> {
					var owner = minecraft.getPlayerList().getPlayer(ownerId);
					var end = minecraft.getLevel(Level.END);
					var dog = (MushroomYorkieEntity) end.getEntity(fixture.dogId());
					int fired = owner.getStats().getValue(Stats.ITEM_USED.get(Items.BOW));
					if (!owner.isAlive() || !owner.level().dimension().equals(Level.END) || owner.getHealth() < 20
							|| fired < 1 || owner.getInventory().countItem(Items.ARROW) != ARROWS - fired
							|| end.getEntity(fixture.crystalId()) != null) {
						throw new AssertionError("Expected a native bow shot to destroy the End crystal without blast damage");
					}
					if (dog == null || !dog.isAlive() || !dog.isOwnedBy(owner) || !dog.isOrderedToSit()
							|| !dog.blockPosition().equals(fixture.shelter()) || dog.getHealth() < fixture.dogHealth()
							|| dog.expeditionCamp.anchor() == null || !dog.expeditionCamp.anchor().dimension().equals(Level.END)) {
						throw new AssertionError("Expected the same unhurt Mushroom to stay beside his End camp");
					}
					System.out.printf("Expedition native End crystal passed: crystal=%s dog=%s arrows=%d%n",
							fixture.crystalId(), fixture.dogId(), fired);
				});
				context.takeScreenshot("expedition-survival-end-crystal");
				return;
			}
			if ("failed".equals(result)) break;
			context.waitTicks(5);
		}
		throw new AssertionError("The controller did not finish the native End crystal replay");
	}

	private record Fixture(BlockPos start, BlockPos shelter, UUID dogId, float dogHealth, int dogRuntimeId,
			UUID crystalId, int crystalRuntimeId) {
	}
}
