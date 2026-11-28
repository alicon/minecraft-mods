package dev.alicon.mushroomyorkie.entity;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import dev.alicon.mushroomyorkie.item.ModItems;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.Collectors;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerContext;
import net.fabricmc.fabric.api.entity.event.v1.ServerLivingEntityEvents;
import net.minecraft.core.BlockPos;
import net.minecraft.stats.Stats;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.boss.enderdragon.EndCrystal;
import net.minecraft.world.entity.boss.enderdragon.EnderDragon;
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
		boolean cageOnly = "1".equals(System.getenv("MUSHROOM_EXPEDITION_CAGE_ONLY"));
		boolean tallestOnly = "1".equals(System.getenv("MUSHROOM_EXPEDITION_TALLEST_ONLY"));
		boolean duelOnly = "1".equals(System.getenv("MUSHROOM_EXPEDITION_DUEL_ONLY"));
		if ((cageOnly ? 1 : 0) + (tallestOnly ? 1 : 0) + (duelOnly ? 1 : 0) > 1) {
			throw new AssertionError("Select one End focus");
		}
		var camp = server.computeOnServer(minecraft -> {
			var end = Objects.requireNonNull(minecraft.getLevel(Level.END));
			var spikes = SpikeFeature.getSpikesForLevel(end);
			for (var spike : spikes) {
				end.getChunk(spike.getCenterX() >> 4, spike.getCenterZ() >> 4);
			}
			int x = 58;
			int z = 6;
			if (cageOnly) {
				var guarded = spikes.stream().filter(SpikeFeature.EndSpike::isGuarded).findFirst().orElseThrow();
				x = guarded.getCenterX() - 16 * Integer.signum(guarded.getCenterX());
				z = guarded.getCenterZ();
			} else if (tallestOnly) {
				var tallest = spikes.stream().filter(spike -> !spike.isGuarded())
						.max(Comparator.comparingInt(SpikeFeature.EndSpike::getHeight)).orElseThrow();
				x = tallest.getCenterX() + 19 * Integer.signum(tallest.getCenterX());
				z = tallest.getCenterZ() + 2;
			} else if (duelOnly) {
				x = 18;
				z = 1;
			}
			var ground = end.getChunk(x >> 4, z >> 4);
			var start = new BlockPos(x, ground.getHeight(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, x & 15, z & 15) + 1, z);
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
			owner.getInventory().add(new ItemStack(Items.COOKED_BEEF, 16));
			owner.getInventory().add(new ItemStack(Items.DIAMOND_PICKAXE));
			if (duelOnly) owner.getInventory().add(new ItemStack(Items.DIAMOND_SWORD));
			owner.getInventory().add(new ItemStack(Items.COBBLESTONE, 64));
			owner.getInventory().add(new ItemStack(Items.COBBLESTONE, 64));
			for (int bucket = 0; bucket < 4; bucket++) {
				owner.getInventory().add(new ItemStack(Items.WATER_BUCKET));
			}
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
		var guardedCrystals = server.computeOnServer(minecraft -> {
			var end = minecraft.getLevel(Level.END);
			var guarded = SpikeFeature.getSpikesForLevel(end).stream().filter(SpikeFeature.EndSpike::isGuarded).toList();
			return end.getEntitiesOfClass(EndCrystal.class, new AABB(camp.start()).inflate(128)).stream()
					.filter(crystal -> guarded.stream().anyMatch(spike -> spike.getCenterX() == crystal.getBlockX()
							&& spike.getCenterZ() == crystal.getBlockZ()))
					.map(EndCrystal::getUUID).collect(Collectors.toUnmodifiableSet());
		});
		UUID tallestCrystal = tallestOnly ? server.computeOnServer(minecraft -> minecraft.getLevel(Level.END)
				.getEntitiesOfClass(EndCrystal.class, new AABB(camp.start()).inflate(128)).stream()
				.filter(crystal -> !guardedCrystals.contains(crystal.getUUID()))
				.max(Comparator.comparingDouble(EndCrystal::getY)).orElseThrow().getUUID()) : null;
		context.waitFor(client -> recordedCrystals.stream().anyMatch(uuid ->
				client.level.getEntity(uuid) instanceof EndCrystal), 300);
		if (duelOnly) {
			context.waitFor(client -> !client.level.getEntities(client.player,
					client.player.getBoundingBox().inflate(128), entity -> entity instanceof EnderDragon).isEmpty(), 300);
		}
		UUID originalDragon = duelOnly ? beginDuel(server, camp, recordedCrystals) : null;
		Files.writeString(status.resolveSibling("end-crystal-companion"), camp.dogId().toString());
		Files.writeString(status, "ready");
		if (duelOnly && "1".equals(System.getenv("MUSHROOM_EXPEDITION_FALL_ONLY"))) {
			verifyWaterLanding(context, server, ownerId, status, camp);
			return;
		}
		if (duelOnly && "1".equals(System.getenv("MUSHROOM_EXPEDITION_REFUGE_ONLY"))) {
			verifyEndermanRefuge(context, server, ownerId, status, camp);
			return;
		}
		boolean controllerFinished = false;
		for (int tick = 0; tick < (duelOnly ? 24_000 : 12_000); tick += 5) {
			String result = Files.readString(status);
			if ("finished".equals(result)) {
				controllerFinished = true;
				break;
			}
			if ("failed".equals(result)) break;
			context.waitTicks(5);
		}
		var evidence = server.computeOnServer(minecraft -> {
			var end = minecraft.getLevel(Level.END);
			var owner = minecraft.getPlayerList().getPlayer(ownerId);
			var dog = (MushroomYorkieEntity) end.getEntity(camp.dogId());
			var report = new JsonObject();
			report.addProperty("startingCrystals", recordedCrystals.size());
			var remaining = new JsonArray();
			for (var crystal : end.getEntitiesOfClass(EndCrystal.class, new AABB(camp.start()).inflate(128))) {
				var entry = new JsonObject();
				entry.addProperty("id", crystal.getUUID().toString());
				entry.addProperty("x", crystal.getX());
				entry.addProperty("y", crystal.getY());
				entry.addProperty("z", crystal.getZ());
				var spike = SpikeFeature.getSpikesForLevel(end).stream()
						.filter(candidate -> candidate.getCenterX() == crystal.getBlockX()
								&& candidate.getCenterZ() == crystal.getBlockZ()).findFirst().orElse(null);
				if (spike != null) entry.addProperty("guarded", spike.isGuarded());
				remaining.add(entry);
			}
			report.add("loadedRemainingCrystals", remaining);
			report.addProperty("ownerAlive", owner != null && owner.isAlive());
			if (owner != null) report.addProperty("bowUses", owner.getStats().getValue(Stats.ITEM_USED.get(Items.BOW)));
			report.addProperty("dragonKilled", end.getDragonFight().saveData().dragonKilled());
			if (duelOnly) {
				report.addProperty("originalDragon", originalDragon.toString());
				report.addProperty("startingDragonHealth", 200);
				if (end.getEntity(originalDragon) instanceof EnderDragon dragon) {
					report.addProperty("remainingDragonHealth", dragon.getHealth());
				}
			}
			report.addProperty("dogId", camp.dogId().toString());
			report.addProperty("dogLoaded", dog != null);
			if (dog != null) {
				report.addProperty("dogAlive", dog.isAlive());
				report.addProperty("dogHealth", dog.getHealth());
				report.addProperty("dogAtShelter", dog.blockPosition().equals(camp.shelter()));
			}
			return report;
		});
		Files.writeString(status.resolveSibling("generated-end-server.json"), evidence.toString() + "\n");
		if (controllerFinished) {
			server.runOnServer(minecraft -> {
				var end = minecraft.getLevel(Level.END);
				var owner = minecraft.getPlayerList().getPlayer(ownerId);
				var dog = (MushroomYorkieEntity) end.getEntity(camp.dogId());
				int shots = owner.getStats().getValue(Stats.ITEM_USED.get(Items.BOW));
				int target = cageOnly || tallestOnly ? 1 : recordedCrystals.size();
				long missing = recordedCrystals.stream().filter(uuid -> end.getEntity(uuid) == null).count();
				int remaining = end.getEntitiesOfClass(EndCrystal.class, new AABB(camp.start()).inflate(128)).size();
				if (duelOnly) {
					if (!owner.isAlive() || !owner.level().dimension().equals(Level.END) || remaining != 0
							|| !end.getDragonFight().saveData().dragonKilled() || end.getEntity(originalDragon) != null
							|| !owner.getInventory().contains(stack -> stack.is(Items.DIAMOND_SWORD) && stack.getDamageValue() > 0)) {
						throw new AssertionError("Expected the full-health native dragon to die after Survival sword strikes");
					}
				} else if (!owner.isAlive() || !owner.level().dimension().equals(Level.END) || shots < target
						|| missing != target || remaining != recordedCrystals.size() - target
						|| end.getDragonFight().saveData().dragonKilled() || (tallestOnly && end.getEntity(tallestCrystal) != null)
						|| (cageOnly && guardedCrystals.stream().noneMatch(uuid -> end.getEntity(uuid) == null))) {
					throw new AssertionError("Expected native bow shots to break the selected generated crystals while the dragon lives");
				}
				if (dog == null || !dog.isAlive() || !dog.isOwnedBy(owner) || !dog.isOrderedToSit()
						|| !dog.blockPosition().equals(camp.shelter()) || dog.getHealth() < camp.dogHealth()
						|| dog.expeditionCamp.anchor() == null || !dog.expeditionCamp.anchor().dimension().equals(Level.END)) {
					throw new AssertionError("Expected the original unhurt Mushroom at his marked End shelter");
				}
				if (duelOnly) {
					System.out.printf("Expedition native full-health dragon passed: dragon=%s dog=%s%n", originalDragon, camp.dogId());
				} else {
					System.out.printf("Expedition native generated %s passed: count=%d arrows=%d dog=%s%n",
							cageOnly ? "cage" : tallestOnly ? "tallest crystal" : "crystals", target, shots, camp.dogId());
				}
			});
			context.takeScreenshot("expedition-survival-generated-end-crystals");
			return;
		}
		throw new AssertionError("The controller did not clear the generated End crystals");
	}

	private static void verifyEndermanRefuge(ClientGameTestContext context, TestServerContext server, UUID ownerId,
			Path status, GeneratedCamp camp) throws IOException {
		for (int tick = 0; tick < 200 && !"refuge-ready".equals(Files.readString(status)); tick += 5) {
			if ("failed".equals(Files.readString(status))) break;
			context.waitTicks(5);
		}
		if (!"refuge-ready".equals(Files.readString(status))) throw new AssertionError("The refuge observer did not start");
		var hitByAttacker = new AtomicBoolean();
		int bucketsBefore = server.computeOnServer(minecraft -> {
			var end = minecraft.getLevel(Level.END);
			var owner = minecraft.getPlayerList().getPlayer(ownerId);
			var attacker = Objects.requireNonNull(EntityType.ENDERMAN.create(end, EntitySpawnReason.TRIGGERED));
			attacker.setPos(Vec3.atBottomCenterOf(owner.blockPosition().north(2)));
			ServerLivingEntityEvents.AFTER_DAMAGE.register((entity, source, baseDamage, damage, blocked) -> {
				if (entity == owner && source.getEntity() == attacker && !blocked && damage > 0) hitByAttacker.set(true);
			});
			end.addFreshEntity(attacker);
			attacker.setTarget(owner);
			return owner.getInventory().countItem(Items.WATER_BUCKET);
		});
		for (int tick = 0; tick < 300 && !"finished".equals(Files.readString(status)); tick += 5) {
			if ("failed".equals(Files.readString(status))) break;
			context.waitTicks(5);
		}
		server.runOnServer(minecraft -> {
			var end = minecraft.getLevel(Level.END);
			var owner = minecraft.getPlayerList().getPlayer(ownerId);
			if (!hitByAttacker.get() || !owner.isAlive() || owner.getHealth() < 12 || !owner.isInWater()
					|| owner.getInventory().countItem(Items.WATER_BUCKET) != bucketsBefore - 1
					|| !end.getBlockState(owner.blockPosition()).is(Blocks.WATER)
					|| !(end.getEntity(camp.dogId()) instanceof MushroomYorkieEntity dog) || !dog.isAlive()
					|| !dog.isOwnedBy(owner) || !dog.isOrderedToSit() || dog.getHealth() != camp.dogHealth()
					|| !dog.blockPosition().equals(camp.shelter())) {
				throw new AssertionError("Expected a native Enderman hit, verified water refuge, and the original unharmed dog at camp");
			}
			System.out.printf("Expedition native Enderman refuge passed: health=%.2f dog=%s%n", owner.getHealth(), dog.getUUID());
		});
		if (!"finished".equals(Files.readString(status))) throw new AssertionError("The client did not confirm the Enderman refuge");
		context.takeScreenshot("expedition-survival-enderman-refuge");
	}

	private static void verifyWaterLanding(ClientGameTestContext context, TestServerContext server, UUID ownerId,
			Path status, GeneratedCamp camp) throws IOException {
		for (int tick = 0; tick < 200 && !"fall-ready".equals(Files.readString(status)); tick += 5) {
			if ("failed".equals(Files.readString(status))) break;
			context.waitTicks(5);
		}
		if (!"fall-ready".equals(Files.readString(status))) throw new AssertionError("The bucket reflex was not armed");
		int bucketsBefore = server.computeOnServer(minecraft -> {
			var owner = minecraft.getPlayerList().getPlayer(ownerId);
			var end = minecraft.getLevel(Level.END);
			var start = camp.start();
			// Reproduce the landing window from the recorded dragon launch with vanilla gravity.
			owner.teleportTo(end, start.getX() + 0.5, start.getY() + 110, start.getZ() + 0.5, Set.of(), 0, 0, false);
			return owner.getInventory().countItem(Items.WATER_BUCKET);
		});
		for (int tick = 0; tick < 300 && !"finished".equals(Files.readString(status)); tick += 5) {
			if ("failed".equals(Files.readString(status))) break;
			context.waitTicks(5);
		}
		server.runOnServer(minecraft -> {
			var owner = minecraft.getPlayerList().getPlayer(ownerId);
			var end = minecraft.getLevel(Level.END);
			if (bucketsBefore < 1 || !owner.isAlive() || owner.getHealth() < 15
					|| owner.getInventory().countItem(Items.WATER_BUCKET) != bucketsBefore - 1
					|| !end.getBlockState(camp.start()).is(Blocks.WATER)
					|| !(end.getEntity(camp.dogId()) instanceof MushroomYorkieEntity dog) || !dog.isAlive()
					|| dog.getHealth() < camp.dogHealth()) {
				throw new AssertionError("Expected the native bucket landing to save the player and leave the original dog unharmed");
			}
			System.out.printf("Expedition native water landing passed: health=%.2f dog=%s%n", owner.getHealth(), dog.getUUID());
		});
		if (!"finished".equals(Files.readString(status))) throw new AssertionError("The client did not observe the water landing");
		context.takeScreenshot("expedition-survival-dragon-water-landing");
	}

	private static UUID beginDuel(TestServerContext server, GeneratedCamp camp, Set<UUID> crystals) {
		return server.computeOnServer(minecraft -> {
			var end = Objects.requireNonNull(minecraft.getLevel(Level.END));
			var fight = end.getDragonFight();
			if (fight.getDragonUUID() == null || !(end.getEntity(fight.getDragonUUID()) instanceof EnderDragon dragon)
					|| dragon.getHealth() != 200 || fight.saveData().dragonKilled()) {
				throw new AssertionError("The duel requires the original full-health vanilla dragon");
			}
			// Begin immediately after the crystal phase. Keep vanilla AI, health and podium untouched.
			for (var crystal : end.getEntitiesOfClass(EndCrystal.class, new AABB(camp.start()).inflate(128))) {
				if (crystals.contains(crystal.getUUID())) crystal.discard();
			}
			return dragon.getUUID();
		});
	}

	private record GeneratedCamp(BlockPos start, BlockPos shelter, UUID dogId, int dogRuntimeId, float dogHealth) {
	}

	private record Fixture(BlockPos start, BlockPos shelter, UUID dogId, float dogHealth, int dogRuntimeId,
			UUID crystalId, int crystalRuntimeId) {
	}
}
