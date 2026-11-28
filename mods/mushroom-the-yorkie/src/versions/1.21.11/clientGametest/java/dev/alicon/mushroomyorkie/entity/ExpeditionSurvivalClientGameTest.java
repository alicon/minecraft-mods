package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.block.ModBlocks;
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
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerContext;
import net.fabricmc.fabric.api.client.gametest.v1.world.TestWorldBuilder;
import net.fabricmc.fabric.api.client.gametest.v1.world.TestWorldSave;
import net.fabricmc.fabric.api.entity.event.v1.ServerLivingEntityEvents;
import net.minecraft.client.gui.screens.DeathScreen;
import net.minecraft.client.gui.screens.WinScreen;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.stats.Stats;
import net.minecraft.tags.StructureTags;
import net.minecraft.world.Difficulty;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.boss.enderdragon.EndCrystal;
import net.minecraft.world.entity.boss.enderdragon.EnderDragon;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.gamerules.GameRules;
import net.minecraft.world.level.entity.EntityTypeTest;
import net.minecraft.world.phys.AABB;

public final class ExpeditionSurvivalClientGameTest implements FabricClientGameTest {
	private static final int ADOPTION_WINDOW_TICKS = 26_000;
	private static final int STONE_WINDOW_TICKS = 38_000;
	private static final int IRON_WINDOW_TICKS = 56_000;
	private static final int NETHER_WINDOW_TICKS = 96_000;
	private static final int NETHER_POWDER_WINDOW_TICKS = 120_000;
	private static final int STRONGHOLD_WINDOW_TICKS = 240_000;
	private static final int COMPLETE_WINDOW_TICKS = 300_000;
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
		boolean full = "expedition".equals(stage);
		boolean endReturn = "end-return".equals(stage);
		boolean reunion = "reunion".equals(stage);
		boolean visitsNether = "nether".equals(stage) || powderTrip || strongholdTrip || full;
		var recovery = recoveryFromManifest(status, stage);
		int windowTicks = switch (stage) {
			case "adoption" -> ADOPTION_WINDOW_TICKS;
			case "stone" -> STONE_WINDOW_TICKS;
			case "iron" -> IRON_WINDOW_TICKS;
			case "nether" -> NETHER_WINDOW_TICKS;
			case "nether-powder" -> NETHER_POWDER_WINDOW_TICKS;
			case "stronghold" -> STRONGHOLD_WINDOW_TICKS;
			case "expedition" -> COMPLETE_WINDOW_TICKS;
			case "end-kit", "defense", "feeding", "portal", "nether-supplies", "nether-distant-supplies", "shelter", "equipment", "end-entry", "end-camp", "end-camp-route", "end-crystal", "generated-end-crystals",
					"eye-route", "stronghold-approach", "ender-supplies", "generated-end-entry", "quarry-tools", "quarry-iron", "end-return", "reunion" -> 0;
			default -> throw new AssertionError("Unknown expedition stage " + stage);
		};
		TestWorldSave save;
		UUID ownerId;
		var originalDog = new AtomicReference<UUID>();
		var stayedWithGear = new AtomicBoolean();
		var togetherInNether = new AtomicBoolean();
		var togetherInEnd = new AtomicBoolean();
		var originalDragon = new AtomicReference<UUID>();
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
		if (endReturn) {
			if (recovery == null) throw new AssertionError("The End return requires a closed crystal-stage save");
			try {
				ExpeditionEndReturnClientScenario.run(context, builder, recovery, status);
			} catch (IOException failure) {
				throw new UncheckedIOException(failure);
			}
			return;
		}
		if (reunion) {
			if (recovery == null) throw new AssertionError("The reunion requires an archived Survival save");
			try {
				ExpeditionReunionClientScenario.run(context, builder, recovery, status);
			} catch (IOException failure) {
				throw new UncheckedIOException(failure);
			}
			return;
		}
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
				if ("end-kit".equals(stage)) {
					ExpeditionEndKitClientScenario.run(context, server, ownerId, status);
					return;
				}
				if ("end-entry".equals(stage) || "generated-end-entry".equals(stage)
						|| "end-camp".equals(stage) || "end-camp-route".equals(stage)) {
					ExpeditionEndEntryClientScenario.run(context, server, ownerId, status,
							!"end-entry".equals(stage), "end-camp".equals(stage) || "end-camp-route".equals(stage),
							"end-camp-route".equals(stage));
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
				boolean verifiedEndVictory = false;
				boolean frozenForHandoff = false;
				Path handoffState = status.resolveSibling("live-handoff-safety");
				if (live) Files.writeString(handoffState, "running");
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
					if (live && frozenForHandoff != "held".equals(result)) {
						frozenForHandoff = "held".equals(result);
						boolean freeze = frozenForHandoff;
						server.runOnServer(minecraft -> minecraft.tickRateManager().setFrozen(freeze));
						Files.writeString(handoffState, freeze ? "frozen" : "running");
					}
					if (full && !verifiedEndVictory && "victory".equals(result)) {
						verifyExpeditionVictory(server, ownerId, originalDog.get(), originalDragon.get());
						context.takeScreenshot("expedition-survival-expedition-victory");
						Files.writeString(status.resolveSibling("native-end-victory"), originalDragon.get().toString());
						verifiedEndVictory = true;
					}
					if (verifiedEndVictory && context.computeOnClient(client -> client.screen instanceof WinScreen)) {
						ExpeditionTravelClientGameTest.finishPortalTravel(context, world, Level.END, Level.OVERWORLD);
					}
					final boolean won = verifiedEndVictory;
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
							if (full && owner.level().dimension().equals(Level.END)) {
								if (!living.isOrderedToSit()) togetherInEnd.set(true);
								var fight = owner.level().getDragonFight();
								if (fight != null && owner.level().getEntity(fight.getDragonUUID()) instanceof EnderDragon dragon
										&& dragon.isAlive() && dragon.getHealth() == dragon.getMaxHealth()) {
									originalDragon.compareAndSet(null, dragon.getUUID());
								}
							}
						}
						if (!finished) {
							return null;
						}
						if (owner.isSleeping() || dogs.size() != 1 || !hasGuide
								|| (!full && !owner.getInventory().contains(stack -> stack.is(Items.WOODEN_PICKAXE)))
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
						if (!full && ("iron".equals(stage) || visitsNether) && (!owner.getInventory().contains(stack -> stack.is(Items.IRON_PICKAXE))
								|| !owner.getInventory().contains(stack -> stack.is(Items.BUCKET) || stack.is(Items.WATER_BUCKET))
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
						if (full) {
							var stats = owner.getStats();
							if (!won || !togetherInEnd.get() || dogs.getFirst().isOrderedToSit()
									|| stats.getValue(Stats.ITEM_CRAFTED.get(Items.IRON_PICKAXE)) == 0
									|| stats.getValue(Stats.ITEM_CRAFTED.get(Items.BOW)) == 0
									|| stats.getValue(Stats.ITEM_CRAFTED.get(Items.ARROW)) == 0
									|| stats.getValue(Stats.ENTITY_KILLED.get(EntityType.BLAZE)) == 0
									|| stats.getValue(Stats.ITEM_CRAFTED.get(Items.ENDER_EYE)) < STRONGHOLD_EYES) {
								throw new AssertionError("Expected earned equipment, full dragon victory, and the original dog back home");
							}
						}
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
					if (full && (!owner.level().dimension().equals(Level.OVERWORLD) || dogs.getFirst().isOrderedToSit()
							|| !minecraft.getLevel(Level.END).getDragonFight().saveData().dragonKilled())) {
						throw new AssertionError("The completed expedition did not reopen with the original dog and defeated dragon");
					}
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
		if (!"iron".equals(stage) && !"nether".equals(stage) && !"nether-powder".equals(stage)
				&& !"stronghold".equals(stage) && !"expedition".equals(stage) && !"end-return".equals(stage) && !"reunion".equals(stage)) {
			throw new AssertionError("The selected stage does not accept an archived save");
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

	private static void verifyExpeditionVictory(TestServerContext server, UUID ownerId, UUID dogId, UUID dragonId) {
		server.runOnServer(minecraft -> {
			var owner = minecraft.getPlayerList().getPlayer(ownerId);
			var end = minecraft.getLevel(Level.END);
			var fight = end.getDragonFight();
			var exit = fight.saveData().exitPortalLocation().orElseThrow();
			if (owner == null || !owner.isAlive() || !owner.level().dimension().equals(Level.END)
					|| dragonId == null || !fight.saveData().dragonKilled() || end.getEntity(dragonId) != null
					|| !BlockPos.betweenClosedStream(exit.offset(-3, 0, -3), exit.offset(3, 1, 3))
							.anyMatch(pos -> end.getBlockState(pos).is(Blocks.END_PORTAL))
					|| !end.getEntitiesOfClass(EndCrystal.class, new AABB(exit).inflate(110)).isEmpty()
					|| !(end.getEntity(dogId) instanceof MushroomYorkieEntity dog)
					|| !dog.isAlive() || !dog.belongsTo(owner) || !dog.isOrderedToSit() || !equipped(dog)
					|| dog.expeditionCamp.anchor() == null || !dog.expeditionCamp.anchor().dimension().equals(Level.END)
					|| !end.getBlockState(dog.expeditionCamp.anchor().pos()).is(ModBlocks.CAMP_MAT)) {
				throw new AssertionError("Expected the original full-health dragon defeated and original dog sheltered at the open exit");
			}
		});
	}

	private static void verifyStrongholdArrival(ServerPlayer owner, MushroomYorkieEntity dog) {
		var underground = owner.level().findNearestMapStructure(StructureTags.EYE_OF_ENDER_LOCATED, owner.blockPosition(), 16, false);
		var stats = owner.getStats();
		var position = owner.blockPosition();
		boolean atPortal = BlockPos.betweenClosedStream(position.offset(-6, -2, -6), position.offset(6, 2, 6))
				.filter(pos -> owner.level().getBlockState(pos).is(Blocks.END_PORTAL_FRAME)).count() == 12;
		if (underground == null || !atPortal || dog.distanceTo(owner) > 16
				|| stats.getValue(Stats.ENTITY_KILLED.get(EntityType.BLAZE)) == 0
				|| stats.getValue(Stats.ITEM_CRAFTED.get(Items.BLAZE_POWDER)) < STRONGHOLD_EYES
				|| stats.getValue(Stats.ITEM_CRAFTED.get(Items.ENDER_EYE)) < STRONGHOLD_EYES
				|| stats.getValue(Stats.ITEM_USED.get(Items.ENDER_EYE)) < 2
				|| owner.getInventory().countItem(Items.ENDER_EYE) < 12
				|| owner.getInventory().countItem(Items.WATER_BUCKET) < 2
				|| owner.getInventory().countItem(Items.BOW) < 1
				|| owner.getInventory().countItem(Items.ARROW) < 96) {
			throw new AssertionError("Expected the original dog, earned Eyes, bow, arrows and two water buckets at the stronghold portal room");
		}
	}
}
