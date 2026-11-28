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
import net.fabricmc.fabric.api.client.gametest.v1.world.TestWorldSave;
import net.fabricmc.fabric.api.entity.event.v1.ServerLivingEntityEvents;
import net.minecraft.client.gui.screens.DeathScreen;
import net.minecraft.world.Difficulty;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.gamerules.GameRules;
import net.minecraft.world.level.entity.EntityTypeTest;

public final class ExpeditionSurvivalClientGameTest implements FabricClientGameTest {
	private static final int ADOPTION_WINDOW_TICKS = 26_000;
	private static final int STONE_WINDOW_TICKS = 38_000;
	private static final int IRON_WINDOW_TICKS = 56_000;
	private static final int NETHER_WINDOW_TICKS = 96_000;

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
		int windowTicks = switch (stage) {
			case "adoption" -> ADOPTION_WINDOW_TICKS;
			case "stone" -> STONE_WINDOW_TICKS;
			case "iron" -> IRON_WINDOW_TICKS;
			case "nether" -> NETHER_WINDOW_TICKS;
			case "defense", "portal", "shelter", "equipment", "end-entry" -> 0;
			default -> throw new AssertionError("Unknown expedition stage " + stage);
		};
		TestWorldSave save;
		UUID ownerId;
		var originalDog = new AtomicReference<UUID>();
		var stayedWithGear = new AtomicBoolean();
		var togetherInNether = new AtomicBoolean();
		var companionDeath = new AtomicReference<String>();
		ServerLivingEntityEvents.AFTER_DEATH.register((entity, source) -> {
			if (entity instanceof MushroomYorkieEntity dog && dog.getUUID().equals(originalDog.get())) {
				companionDeath.set(source.getLocalizedDeathMessage(dog).getString());
			}
		});
		try (var world = context.worldBuilder().setUseConsistentSettings(false).adjustSettings(settings -> {
			settings.setName("Codex Expedition Survival");
			settings.setDifficulty(Difficulty.NORMAL);
			settings.setAllowCommands(false);
			if (seed != null) {
				settings.setSeed(seed);
			}
			if (spawnRadius != null) {
				settings.getGameRules().set(GameRules.RESPAWN_RADIUS, Integer.parseInt(spawnRadius), null);
			}
		}).create()) {
			world.getClientWorld().waitForChunksRender();
			save = world.getWorldSave();
			ownerId = context.computeOnClient(client -> client.player.getUUID());
			var server = world.getServer();
			server.runOnServer(minecraft -> {
				var owner = minecraft.getPlayerList().getPlayer(ownerId);
				if (owner.isCreative() || owner.isSpectator() || !owner.getInventory().isEmpty()
						|| minecraft.getWorldData().getDifficulty() != Difficulty.NORMAL
						|| minecraft.getWorldData().isAllowCommands()) {
					throw new AssertionError("Expected a fresh Normal Survival player with an empty inventory");
				}
				System.out.printf("Expedition Survival ready: seed=%s world=%s owner=%s%n",
						minecraft.overworld().getSeed(), minecraft.getWorldData().getLevelName(), ownerId);
			});
			try {
				if ("defense".equals(stage)) {
					ExpeditionCompanionClientScenario.run(context, server, ownerId, status);
					return;
				}
				if ("portal".equals(stage)) {
					ExpeditionPortalClientScenario.run(context, server, ownerId, status);
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
				if ("end-entry".equals(stage)) {
					ExpeditionEndEntryClientScenario.run(context, server, ownerId, status);
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
						if ("nether".equals(stage) && originalDog.get() != null
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
						if (("iron".equals(stage) || "nether".equals(stage)) && (!owner.getInventory().contains(stack -> stack.is(Items.IRON_PICKAXE))
								|| !owner.getInventory().contains(stack -> stack.is(Items.BUCKET))
								|| !owner.getInventory().contains(stack -> stack.is(Items.SHIELD)))) {
							throw new AssertionError("The player did not finish with the earned iron pickaxe, bucket and shield");
						}
						if ("nether".equals(stage) && (!togetherInNether.get() || !owner.level().dimension().equals(Level.OVERWORLD)
								|| !equipped(dogs.getFirst()) || !owner.getInventory().contains(stack -> stack.is(ModItems.CAMP_MAT)))) {
							throw new AssertionError("Expected the same equipped dog through the Nether round trip and the camp mat in the inventory");
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
					if ("nether".equals(stage) && !equipped(dogs.getFirst())) {
						throw new AssertionError("The original dog's harness and vest did not reload");
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

	private static boolean equipped(MushroomYorkieEntity dog) {
		return dog.hasHarness() && dog.hasExpeditionVest();
	}
}
