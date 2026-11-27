package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.item.ModItems;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.minecraft.world.Difficulty;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.gamerules.GameRules;
import net.minecraft.world.level.entity.EntityTypeTest;

public final class ExpeditionSurvivalClientGameTest implements FabricClientGameTest {
	private static final int ADOPTION_WINDOW_TICKS = 26_000;
	private static final int STONE_WINDOW_TICKS = 38_000;

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
		String seed = System.getenv("MUSHROOM_EXPEDITION_SEED");
		String spawnRadius = System.getenv("MUSHROOM_EXPEDITION_SPAWN_RADIUS");
		boolean stoneStage = "stone".equals(System.getenv("MUSHROOM_EXPEDITION_STAGE"));
		int windowTicks = stoneStage ? STONE_WINDOW_TICKS : ADOPTION_WINDOW_TICKS;
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
			var ownerId = context.computeOnClient(client -> client.player.getUUID());
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
				var originalDog = new AtomicReference<UUID>();
				Files.writeString(status, "ready", StandardOpenOption.CREATE_NEW);
				for (int elapsed = 0; elapsed < windowTicks; elapsed += 10) {
					String result = Files.readString(status);
					if ("failed".equals(result)) {
						throw new AssertionError("The Survival controller reported a failure. See its action trace.");
					}
					boolean finished = "finished".equals(result);
					String dogEvidence = server.computeOnServer(minecraft -> {
						var owner = minecraft.getPlayerList().getPlayer(ownerId);
						if (owner == null || !owner.isAlive()) {
							throw new AssertionError("The Survival player is missing or dead");
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
						if (stoneStage && (!owner.getInventory().contains(stack -> stack.is(Items.STONE_PICKAXE))
								|| !owner.getInventory().contains(stack -> stack.is(Items.FURNACE)))) {
							throw new AssertionError("The player did not finish with the earned stone pickaxe and furnace");
						}
						return dogs.getFirst().getUUID().toString();
					});
					if (dogEvidence != null) {
						String stage = stoneStage ? "stone" : "adoption";
						System.out.printf("Expedition Survival %s passed: dog=%s owner=%s ticks=%s%n",
								stage, dogEvidence, ownerId, elapsed);
						context.takeScreenshot("expedition-survival-" + stage);
						return;
					}
					context.waitTicks(10);
				}
				throw new AssertionError("The Survival controller did not finish the selected stage within its window");
			} catch (AssertionError failure) {
				context.takeScreenshot("expedition-survival-failure");
				throw failure;
			} catch (IOException io) {
				throw new UncheckedIOException(io);
			}
		}
	}
}
