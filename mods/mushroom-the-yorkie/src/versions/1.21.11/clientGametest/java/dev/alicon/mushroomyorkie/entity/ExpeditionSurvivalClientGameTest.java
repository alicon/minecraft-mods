package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.item.ModItems;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.fabricmc.fabric.api.client.gametest.v1.world.TestWorldBuilder;
import net.fabricmc.fabric.api.client.gametest.v1.world.TestWorldSave;
import net.fabricmc.fabric.api.entity.event.v1.ServerLivingEntityEvents;
import net.minecraft.client.gui.screens.DeathScreen;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.stats.Stats;
import net.minecraft.tags.StructureTags;
import net.minecraft.world.Difficulty;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.gamerules.GameRules;
import net.minecraft.world.level.entity.EntityTypeTest;

public final class ExpeditionSurvivalClientGameTest implements FabricClientGameTest {
	private static final int ADOPTION_WINDOW_TICKS = 26_000;
	private static final int STONE_WINDOW_TICKS = 38_000;
	private static final int IRON_WINDOW_TICKS = 56_000;
	private static final int NETHER_WINDOW_TICKS = 96_000;
	private static final int NETHER_POWDER_WINDOW_TICKS = 120_000;
	private static final int STRONGHOLD_WINDOW_TICKS = 240_000;
	private static final int PORTAL_POWDER = 12;
	private static final int STRONGHOLD_EYES = 20;

	@Override
	public void runTest(ClientGameTestContext context) {
		if (!Boolean.getBoolean("mushroom.expedition.survivalTest")) {
			return;
		}
		String statusPath = System.getenv("MUSHROOM_EXPEDITION_STATUS");
		if (statusPath == null || !Path.of(statusPath).isAbsolute()) {
			throw new AssertionError("Set MUSHROOM_EXPEDITION_STATUS to a new absolute run status path");
		}
		Path status = Path.of(statusPath);
		boolean live = "1".equals(System.getenv("MUSHROOM_EXPEDITION_LIVE"));
		String seed = System.getenv("MUSHROOM_EXPEDITION_SEED");
		String spawnRadius = System.getenv("MUSHROOM_EXPEDITION_SPAWN_RADIUS");
		String requestedStage = System.getenv("MUSHROOM_EXPEDITION_STAGE");
		String stage = requestedStage == null ? "adoption" : requestedStage;
		boolean powderTrip = "nether-powder".equals(stage);
		boolean strongholdTrip = "stronghold".equals(stage);
		boolean visitsNether = "nether".equals(stage) || powderTrip || strongholdTrip;
		var recovery = recoveryFromManifest(status, stage);
		int windowTicks = switch (stage) {
			case "adoption" -> ADOPTION_WINDOW_TICKS;
			case "stone" -> STONE_WINDOW_TICKS;
			case "iron" -> IRON_WINDOW_TICKS;
			case "nether" -> NETHER_WINDOW_TICKS;
			case "nether-powder" -> NETHER_POWDER_WINDOW_TICKS;
			case "stronghold" -> STRONGHOLD_WINDOW_TICKS;
			case "defense", "feeding", "portal", "nether-supplies", "nether-distant-supplies", "shelter", "equipment", "end-entry", "end-crystal", "generated-end-crystals",
					"eye-route", "stronghold-approach", "ender-supplies", "generated-end-entry", "quarry-tools", "quarry-iron" -> 0;
			default -> throw new AssertionError("Unknown expedition stage " + stage);
		};
		TestWorldSave save;
		UUID ownerId;
		var originalDog = new AtomicReference<UUID>();
		var stayedWithGear = new AtomicBoolean();
		var togetherInNether = new AtomicBoolean();
		var companionDeath = new AtomicReference<String>();
		ServerLivingEntityEvents.AFTER_DAMAGE.register((entity, source, baseDamage, damage, blocked) -> {
			if (damage > 0 && !blocked && entity instanceof MushroomYorkieEntity dog && dog.getUUID().equals(originalDog.get())) {
				System.out.printf("Expedition companion hurt: dog=%s source=%s amount=%.2f health=%.2f dimension=%s pos=%s%n",
						dog.getUUID(), source.getMsgId(), damage, dog.getHealth(), dog.level().dimension().identifier(), dog.blockPosition());
			}
		});
		ServerLivingEntityEvents.AFTER_DEATH.register((entity, source) -> {
			if (entity instanceof MushroomYorkieEntity dog && dog.getUUID().equals(originalDog.get())) {
				companionDeath.set(source.getLocalizedDeathMessage(dog).getString());
			}
		});
		var builder = context.worldBuilder().setUseConsistentSettings("ender-supplies".equals(stage)).adjustSettings(settings -> {
			settings.setName("Codex Expedition Survival");
			settings.setDifficulty(Difficulty.NORMAL);
			settings.setAllowCommands(false);
			if (seed != null) {
				settings.setSeed(seed);
			}
			if (spawnRadius != null) {
				settings.getGameRules().set(GameRules.RESPAWN_RADIUS, Integer.parseInt(spawnRadius), null);
			}
		});
		try (var world = openWorld(builder, recovery)) {
			world.getClientWorld().waitForChunksRender();
			save = world.getWorldSave();
			ownerId = context.computeOnClient(client -> client.player.getUUID());
			var server = world.getServer();
			server.runOnServer(minecraft -> {
				var owner = minecraft.getPlayerList().getPlayer(ownerId);
				if (owner == null || owner.isCreative() || owner.isSpectator() || (recovery == null && !owner.getInventory().isEmpty())
						|| minecraft.getWorldData().getDifficulty() != Difficulty.NORMAL
						|| minecraft.getWorldData().isAllowCommands()) {
					throw new AssertionError("Expected a Normal Survival player with commands disabled");
				}
				System.out.printf("Expedition Survival ready: seed=%s world=%s owner=%s%n",
						minecraft.overworld().getSeed(), minecraft.getWorldData().getLevelName(), ownerId);
			});
			try {
				if (recovery != null) {
					recovery.verifyAndWriteCheckpoint(world, ownerId, status);
					originalDog.set(recovery.dog());
					System.out.printf("Expedition restored at iron: dog=%s owner=%s%n", recovery.dog(), ownerId);
				}
				if ("defense".equals(stage)) {
					ExpeditionCompanionClientScenario.run(context, server, ownerId, status);
					return;
				}
				if ("feeding".equals(stage)) {
					ExpeditionFeedingClientScenario.run(context, server, ownerId, status);
					return;
				}
				if ("portal".equals(stage) || "nether-supplies".equals(stage) || "nether-distant-supplies".equals(stage)) {
					ExpeditionPortalClientScenario.run(context, server, ownerId, status, !"portal".equals(stage),
							"nether-distant-supplies".equals(stage));
					return;
				}
				if ("shelter".equals(stage)) {
					ExpeditionShelterClientScenario.run(context, server, ownerId, status);
					return;
				}
				if ("equipment".equals(stage)) {
					ExpeditionGearClientScenario.run(context, server, ownerId, status);
					return;
				}
				if ("ender-supplies".equals(stage)) {
					ExpeditionPearlClientScenario.run(context, server, ownerId, status);
					return;
				}
				if ("end-entry".equals(stage) || "generated-end-entry".equals(stage)) {
					ExpeditionEndEntryClientScenario.run(context, server, ownerId, status, "generated-end-entry".equals(stage));
					return;
				}
				if ("end-crystal".equals(stage)) {
					ExpeditionEndCrystalClientScenario.run(context, server, ownerId, status);
					return;
				}
				if ("generated-end-crystals".equals(stage)) {
					ExpeditionEndCrystalClientScenario.runGenerated(context, server, ownerId, status);
					return;
				}
				if ("eye-route".equals(stage) || "stronghold-approach".equals(stage)) {
					ExpeditionEyeRouteClientScenario.run(context, server, ownerId, status, "stronghold-approach".equals(stage));
					return;
				}
				if ("quarry-tools".equals(stage)) {
					ExpeditionQuarryToolsClientScenario.run(context, server, ownerId, status);
					return;
				}
				if ("quarry-iron".equals(stage)) {
					ExpeditionIronClientScenario.run(context, server, ownerId, status);
					return;
				}
				Files.writeString(status, "ready", StandardOpenOption.CREATE_NEW);
				boolean passed = false;
				for (int elapsed = 0; elapsed < windowTicks; elapsed += 10) {
					String dogLoss = companionDeath.get();
					if (dogLoss != null) {
						throw new AssertionError("Expedition lost the original companion: " + dogLoss);
					}
					String result = Files.readString(status);
					if ("failed".equals(result)) {
						throw new AssertionError("The Survival controller reported a failure. See its action trace.");
					}
					boolean finished = "finished".equals(result);
					if (live && !finished && context.computeOnClient(client -> client.screen instanceof DeathScreen)) {
						var death = server.computeOnServer(minecraft -> {
							var owner = minecraft.getPlayerList().getPlayer(ownerId);
							var position = owner.blockPosition();
							return String.format("%s %d %d %d %d", owner.level().dimension().identifier(),
									position.getX(), position.getY(), position.getZ(), minecraft.overworld().getGameTime());
						});
						context.takeScreenshot("expedition-survival-owner-death-" + elapsed);
						System.out.println("Expedition Survival owner died: " + death);
						context.waitTicks(21);
						if (context.computeOnClient(client -> client.screen instanceof DeathScreen)) {
							context.clickScreenButton("deathScreen.respawn");
						}
						context.waitFor(client -> client.player != null && client.player.isAlive()
								&& !(client.screen instanceof DeathScreen));
						Files.writeString(status.resolveSibling("last-owner-death"), death);
						System.out.println("Expedition Survival owner respawned in the same save");
						continue;
					}
					String dogEvidence = server.computeOnServer(minecraft -> {
						var owner = minecraft.getPlayerList().getPlayer(ownerId);
						if (owner == null) {
							throw new AssertionError("The Survival player is missing");
						}
						if (!owner.isAlive()) {
							if (live && !finished) return null;
							throw new AssertionError("The Survival player is dead");
						}
						boolean hasGuide = owner.getInventory().contains(stack -> stack.is(ModItems.FIELD_GUIDE));
						if (!finished && !hasGuide) {
							return null;
						}
						var dogs = minecraft.overworld().getEntities(EntityTypeTest.forClass(MushroomYorkieEntity.class),
								dog -> dog.isAlive() && dog.belongsTo(owner));
						if (dogs.size() == 1) {
							originalDog.compareAndSet(null, dogs.getFirst().getUUID());
						}
						if (visitsNether && originalDog.get() != null
								&& owner.level().getEntity(originalDog.get()) instanceof MushroomYorkieEntity living
								&& living.isAlive() && living.belongsTo(owner) && equipped(living)) {
							if (owner.level().dimension().equals(Level.OVERWORLD) && living.isOrderedToSit()) {
								stayedWithGear.set(true);
							}
							if (stayedWithGear.get() && owner.level().dimension().equals(Level.NETHER) && !living.isOrderedToSit()) {
								togetherInNether.set(true);
							}
						}
						if (!finished) {
							return null;
						}
						if (owner.isSleeping() || dogs.size() != 1 || !hasGuide
								|| !owner.getInventory().contains(stack -> stack.is(Items.WOODEN_PICKAXE))
								|| minecraft.overworld().getDayTime() < 24_000L) {
							throw new AssertionError("Expected to wake the next day with one living owned dog, the guide, and the pickaxe");
						}
						if (!dogs.getFirst().getUUID().equals(originalDog.get())) {
							throw new AssertionError("The dog at the end was not the dog first adopted");
						}
						if ("stone".equals(stage) && (!owner.getInventory().contains(stack -> stack.is(Items.STONE_PICKAXE))
								|| !owner.getInventory().contains(stack -> stack.is(Items.FURNACE)))) {
							throw new AssertionError("The player did not finish with the earned stone pickaxe and furnace");
						}
						if (("iron".equals(stage) || visitsNether) && (!owner.getInventory().contains(stack -> stack.is(Items.IRON_PICKAXE))
								|| !owner.getInventory().contains(stack -> stack.is(Items.BUCKET))
								|| !owner.getInventory().contains(stack -> stack.is(Items.SHIELD)))) {
							throw new AssertionError("The player did not finish with the earned iron pickaxe, bucket and shield");
						}
						if (visitsNether && (!togetherInNether.get() || !owner.level().dimension().equals(Level.OVERWORLD)
								|| !equipped(dogs.getFirst()))) {
							throw new AssertionError("Expected the same equipped dog through the Nether round trip");
						}
						if ("nether".equals(stage) && !owner.getInventory().contains(stack -> stack.is(ModItems.CAMP_MAT))) {
							throw new AssertionError("The camp mat must be packed for the Nether round trip");
						}
						if (powderTrip && (owner.getStats().getValue(Stats.ENTITY_KILLED.get(EntityType.BLAZE)) == 0
								|| owner.getStats().getValue(Stats.ITEM_CRAFTED.get(Items.BLAZE_POWDER)) < PORTAL_POWDER
								|| owner.getInventory().countItem(Items.BLAZE_POWDER) < PORTAL_POWDER)) {
							throw new AssertionError("Expected the fresh expedition to earn and craft its stronghold powder supply");
						}
						if (strongholdTrip) verifyStrongholdArrival(owner, dogs.getFirst());
						return dogs.getFirst().getUUID().toString();
					});
					if (dogEvidence != null) {
						System.out.printf("Expedition Survival %s passed: dog=%s owner=%s ticks=%s%n",
								stage, dogEvidence, ownerId, elapsed);
						context.takeScreenshot("expedition-survival-" + stage);
						passed = true;
						break;
					}
					context.waitTicks(10);
				}
				if (!passed) {
					throw new AssertionError("The Survival controller did not finish the selected stage within its window");
				}
			} catch (AssertionError failure) {
				context.takeScreenshot("expedition-survival-failure");
				throw failure;
			} catch (IOException io) {
				throw new UncheckedIOException(io);
			}
		}
		try (var reopened = save.open()) {
			reopened.getClientWorld().waitForChunksRender();
			try {
				reopened.getServer().runOnServer(minecraft -> {
					var owner = minecraft.getPlayerList().getPlayer(ownerId);
					if (owner == null || !owner.isAlive()
							|| !owner.getInventory().contains(stack -> stack.is(ModItems.FIELD_GUIDE))) {
						throw new AssertionError("The original Survival owner and expedition guide did not reload");
					}
					var dogs = minecraft.overworld().getEntities(EntityTypeTest.forClass(MushroomYorkieEntity.class),
							dog -> dog.isAlive() && dog.belongsTo(owner));
					if (dogs.size() != 1 || !dogs.getFirst().getUUID().equals(originalDog.get())) {
						throw new AssertionError("Expected the original living dog after reopening the earned Survival save");
					}
					if (visitsNether && !equipped(dogs.getFirst())) {
						throw new AssertionError("The original dog's harness and vest did not reload");
					}
					if (powderTrip && (!owner.level().dimension().equals(Level.OVERWORLD)
							|| owner.getInventory().countItem(Items.BLAZE_POWDER) < PORTAL_POWDER)) {
						throw new AssertionError("The earned powder and its owner did not reload back home");
					}
				if (strongholdTrip) verifyStrongholdArrival(owner, dogs.getFirst());
				});
				System.out.printf("Expedition Survival %s reopened: dog=%s owner=%s%n", stage, originalDog.get(), ownerId);
				context.takeScreenshot("expedition-survival-" + stage + "-reopened");
			} catch (AssertionError failure) {
				context.takeScreenshot("expedition-survival-reopen-failure");
				throw failure;
			}
		}
	}

	private static ExpeditionSaveRecovery recoveryFromManifest(Path status, String stage) {
		String manifest = System.getenv("MUSHROOM_EXPEDITION_RESTORE_MANIFEST");
		if (manifest == null) return null;
		if (!"iron".equals(stage) && !"nether".equals(stage) && !"nether-powder".equals(stage) && !"stronghold".equals(stage)) {
			throw new AssertionError("The selected stage cannot continue from an archived iron checkpoint");
		}
		try {
			return ExpeditionSaveRecovery.read(Path.of(manifest), status);
		} catch (IOException failure) {
			throw new UncheckedIOException(failure);
		}
	}

	private static TestSingleplayerContext openWorld(TestWorldBuilder builder, ExpeditionSaveRecovery recovery) {
		try {
			return recovery == null ? builder.create() : recovery.openCopy(builder);
		} catch (IOException failure) {
			throw new UncheckedIOException(failure);
		}
	}

	private static boolean equipped(MushroomYorkieEntity dog) {
		return dog.hasHarness() && dog.hasExpeditionVest();
	}

	private static void verifyStrongholdArrival(ServerPlayer owner, MushroomYorkieEntity dog) {
		var underground = owner.level().findNearestMapStructure(StructureTags.EYE_OF_ENDER_LOCATED, owner.blockPosition(), 16, false);
		var stats = owner.getStats();
		if (underground == null
				|| Math.hypot(owner.getX() - underground.getX() - 0.5, owner.getZ() - underground.getZ() - 0.5) > 12
				|| dog.distanceTo(owner) > 16
				|| stats.getValue(Stats.ENTITY_KILLED.get(EntityType.BLAZE)) == 0
				|| stats.getValue(Stats.ITEM_CRAFTED.get(Items.BLAZE_POWDER)) < STRONGHOLD_EYES
				|| stats.getValue(Stats.ITEM_CRAFTED.get(Items.ENDER_EYE)) < STRONGHOLD_EYES
				|| stats.getValue(Stats.ITEM_USED.get(Items.ENDER_EYE)) < 2
				|| owner.getInventory().countItem(Items.ENDER_EYE) < 12) {
			throw new AssertionError("Expected the original dog and earned Eye supply at the generated stronghold approach");
		}
	}
}
