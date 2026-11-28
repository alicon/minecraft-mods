package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.item.ModItems;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerContext;
import net.minecraft.core.BlockPos;
import net.minecraft.stats.Stats;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.boss.enderdragon.EndCrystal;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.levelgen.feature.SpikeFeature;
import net.minecraft.world.phys.AABB;
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

	static void runGenerated(ClientGameTestContext context, TestServerContext server, UUID ownerId, Path status) throws IOException {
		var camp = server.computeOnServer(minecraft -> {
			var end = Objects.requireNonNull(minecraft.getLevel(Level.END));
			for (var spike : SpikeFeature.getSpikesForLevel(end)) {
				end.getChunk(spike.getCenterX() >> 4, spike.getCenterZ() >> 4);
			}
			var ground = end.getChunk(3, 0);
			var start = new BlockPos(58, ground.getHeight(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, 10, 6) + 1, 6);
			var shelter = start.east(2).south(2);
			for (BlockPos pos : BlockPos.betweenClosed(start.offset(-2, -1, -3), start.offset(5, -1, 5))) {
				end.setBlockAndUpdate(pos, Blocks.END_STONE.defaultBlockState());
				end.setBlockAndUpdate(pos.above(), Blocks.AIR.defaultBlockState());
				end.setBlockAndUpdate(pos.above(2), Blocks.AIR.defaultBlockState());
			}
			for (BlockPos pos : BlockPos.betweenClosed(shelter.offset(-1, 2, -1), shelter.offset(2, 2, 2))) {
				end.setBlockAndUpdate(pos, Blocks.OBSIDIAN.defaultBlockState());
			}
			var owner = Objects.requireNonNull(minecraft.getPlayerList().getPlayer(ownerId));
			owner.teleportTo(end, start.getX() + 0.5, start.getY(), start.getZ() + 0.5, Set.of(), 0, 0, false);
			owner.setItemSlot(EquipmentSlot.HEAD, new ItemStack(Items.DIAMOND_HELMET));
			owner.setItemSlot(EquipmentSlot.CHEST, new ItemStack(Items.DIAMOND_CHESTPLATE));
			owner.setItemSlot(EquipmentSlot.LEGS, new ItemStack(Items.DIAMOND_LEGGINGS));
			owner.setItemSlot(EquipmentSlot.FEET, new ItemStack(Items.DIAMOND_BOOTS));
			owner.getInventory().add(new ItemStack(Items.BOW));
			owner.getInventory().add(new ItemStack(Items.ARROW, 64));
			owner.getInventory().add(new ItemStack(Items.ARROW, 32));
			owner.getInventory().add(new ItemStack(Items.GOLDEN_APPLE, 4));
			owner.getInventory().add(new ItemStack(ModItems.CAMP_MAT));
			var dog = Objects.requireNonNull(ModEntities.MUSHROOM_YORKIE.create(end, EntitySpawnReason.TRIGGERED));
			dog.claimFor(owner);
			dog.setMushroomOrderedToSit(true);
			dog.setPos(Vec3.atBottomCenterOf(shelter));
			end.addFreshEntity(dog);
			return new GeneratedCamp(start, shelter, dog.getUUID(), dog.getId(), dog.getHealth());
		});
		context.waitFor(client -> client.screen == null && client.level.dimension().equals(Level.END)
				&& client.player.blockPosition().equals(camp.start())
				&& client.level.getEntity(camp.dogRuntimeId()) instanceof MushroomYorkieEntity yorkie
				&& yorkie.isAlive() && client.player.getInventory().contains(stack -> stack.is(Items.BOW)));
		Set<UUID> crystals = Set.of();
		for (int tick = 0; tick < 300 && crystals.size() < SpikeFeature.NUMBER_OF_SPIKES; tick += 5) {
			crystals = server.computeOnServer(minecraft -> minecraft.getLevel(Level.END)
					.getEntitiesOfClass(EndCrystal.class, new AABB(camp.start()).inflate(128)).stream()
					.map(EndCrystal::getUUID).collect(Collectors.toUnmodifiableSet()));
			if (crystals.size() < SpikeFeature.NUMBER_OF_SPIKES) context.waitTicks(5);
		}
		if (crystals.size() != SpikeFeature.NUMBER_OF_SPIKES) {
			throw new AssertionError("Expected all vanilla End spike crystals to load, found " + crystals.size());
		}
		var recordedCrystals = crystals;
		context.waitFor(client -> recordedCrystals.stream().anyMatch(uuid ->
				client.level.getEntity(uuid) instanceof EndCrystal), 300);
		Files.writeString(status.resolveSibling("end-crystal-companion"), camp.dogId().toString());
		Files.writeString(status, "ready");
		for (int tick = 0; tick < 12_000; tick += 5) {
			String result = Files.readString(status);
			if ("finished".equals(result)) {
				server.runOnServer(minecraft -> {
					var end = minecraft.getLevel(Level.END);
					var owner = minecraft.getPlayerList().getPlayer(ownerId);
					var dog = (MushroomYorkieEntity) end.getEntity(camp.dogId());
					int shots = owner.getStats().getValue(Stats.ITEM_USED.get(Items.BOW));
					if (!owner.isAlive() || !owner.level().dimension().equals(Level.END) || shots < recordedCrystals.size()
							|| recordedCrystals.stream().anyMatch(uuid -> end.getEntity(uuid) != null)
							|| !end.getEntitiesOfClass(EndCrystal.class, new AABB(camp.start()).inflate(128)).isEmpty()
							|| end.getDragonFight().saveData().dragonKilled()) {
						throw new AssertionError("Expected native bow shots to break all the generated crystals before the dragon fight");
					}
					if (dog == null || !dog.isAlive() || !dog.isOwnedBy(owner) || !dog.isOrderedToSit()
							|| !dog.blockPosition().equals(camp.shelter()) || dog.getHealth() < camp.dogHealth()
							|| dog.expeditionCamp.anchor() == null || !dog.expeditionCamp.anchor().dimension().equals(Level.END)) {
						throw new AssertionError("Expected the original unhurt Mushroom at his marked End shelter");
					}
					System.out.printf("Expedition native generated crystals passed: count=%d arrows=%d dog=%s%n",
							recordedCrystals.size(), shots, camp.dogId());
				});
				context.takeScreenshot("expedition-survival-generated-end-crystals");
				return;
			}
			if ("failed".equals(result)) break;
			context.waitTicks(5);
		}
		throw new AssertionError("The controller did not clear the generated End crystals");
	}

	private record GeneratedCamp(BlockPos start, BlockPos shelter, UUID dogId, int dogRuntimeId, float dogHealth) {
	}

	private record Fixture(BlockPos start, BlockPos shelter, UUID dogId, float dogHealth, int dogRuntimeId,
			UUID crystalId, int crystalRuntimeId) {
	}
}
