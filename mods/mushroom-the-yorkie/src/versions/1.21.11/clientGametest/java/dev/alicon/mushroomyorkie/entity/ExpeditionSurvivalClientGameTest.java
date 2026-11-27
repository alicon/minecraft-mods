package dev.alicon.mushroomyorkie.entity;

import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.minecraft.world.Difficulty;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.gamerules.GameRules;

public final class ExpeditionSurvivalClientGameTest implements FabricClientGameTest {
	private static final int SUPPLY_WINDOW_TICKS = 3600;

	@Override
	public void runTest(ClientGameTestContext context) {
		if (!Boolean.getBoolean("mushroom.expedition.survivalTest")) {
			return;
		}
		String seed = System.getenv("MUSHROOM_EXPEDITION_SEED");
		String spawnRadius = System.getenv("MUSHROOM_EXPEDITION_SPAWN_RADIUS");
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
				System.out.printf("Expedition supplies ready: seed=%s world=%s owner=%s%n",
						minecraft.overworld().getSeed(), minecraft.getWorldData().getLevelName(), ownerId);
			});
			try {
				for (int elapsed = 0; elapsed < SUPPLY_WINDOW_TICKS; elapsed += 10) {
					boolean crafted = server.computeOnServer(minecraft -> {
						var owner = minecraft.getPlayerList().getPlayer(ownerId);
						if (!owner.isAlive()) {
							throw new AssertionError("The Survival player died before earning early supplies");
						}
						return owner.getInventory().contains(stack -> stack.is(Items.WOODEN_PICKAXE));
					});
					if (crafted) {
						System.out.printf("Expedition supplies passed: wooden pickaxe after %s ticks%n", elapsed);
						context.takeScreenshot("expedition-survival-early-supplies");
						return;
					}
					context.waitTicks(10);
				}
				throw new AssertionError("No wooden pickaxe was earned within the Survival pilot window");
			} catch (AssertionError failure) {
				context.takeScreenshot("expedition-survival-failure");
				throw failure;
			}
		}
	}
}
