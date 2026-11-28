package dev.alicon.mushroomyorkie.entity;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import dev.alicon.mushroomyorkie.block.ModBlocks;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Objects;
import java.util.UUID;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerContext;
import net.fabricmc.fabric.api.client.gametest.v1.world.TestWorldBuilder;
import net.fabricmc.fabric.api.client.gametest.v1.world.TestWorldSave;
import net.minecraft.client.gui.screens.WinScreen;
import net.minecraft.core.BlockPos;
import net.minecraft.world.Difficulty;
import net.minecraft.world.entity.boss.enderdragon.EndCrystal;
import net.minecraft.world.entity.boss.enderdragon.EnderDragon;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.AABB;

final class ExpeditionEndReturnClientScenario {
	private ExpeditionEndReturnClientScenario() {
	}

	static void run(ClientGameTestContext context, TestWorldBuilder builder, ExpeditionSaveRecovery recovery,
			Path status) throws IOException {
		UUID ownerId = recovery.owner();
		UUID dogId = recovery.dog();
		TestWorldSave save;
		try (var world = recovery.openCopy(builder)) {
			save = world.getWorldSave();
			world.getClientWorld().waitForChunksRender();
			context.waitFor(client -> client.screen == null && client.level.dimension().equals(Level.END)
					&& client.player.getUUID().equals(ownerId)
					&& !client.level.getEntities(client.player, client.player.getBoundingBox().inflate(128),
							entity -> entity instanceof EnderDragon).isEmpty(), 300);
			var server = world.getServer();
			var start = server.computeOnServer(minecraft -> {
				var owner = Objects.requireNonNull(minecraft.getPlayerList().getPlayer(ownerId));
				var end = Objects.requireNonNull(minecraft.getLevel(Level.END));
				var fight = Objects.requireNonNull(end.getDragonFight());
				var sleepingAtCamp = end.getEntity(dogId);
				if (!owner.isAlive() || owner.isCreative() || owner.isSpectator()
						|| !owner.level().dimension().equals(Level.END)
						|| minecraft.overworld().getSeed() != recovery.seed()
						|| minecraft.getWorldData().getDifficulty() != Difficulty.NORMAL
						|| minecraft.getWorldData().isAllowCommands()
						|| fight.saveData().dragonKilled()
						|| !(end.getEntity(fight.getDragonUUID()) instanceof EnderDragon dragon) || !dragon.isAlive()
						|| !end.getEntitiesOfClass(EndCrystal.class, new AABB(owner.blockPosition()).inflate(128)).isEmpty()
						|| !(sleepingAtCamp instanceof MushroomYorkieEntity dog) || !dog.isAlive()
						|| !dog.belongsTo(owner) || !dog.isOrderedToSit() || dog.expeditionCamp.anchor() == null
						|| !dog.expeditionCamp.anchor().dimension().equals(Level.END)
						|| !end.getBlockState(dog.expeditionCamp.anchor().pos()).is(ModBlocks.CAMP_MAT)) {
					throw new AssertionError("The archived End did not reopen with its original player, living dragon, and sheltered dog"
							+ ": player=" + owner.blockPosition() + " dragon=" + fight.getDragonUUID() + " dog=" + sleepingAtCamp);
				}
				return new Start(dragon.getUUID(), dragon.getHealth(), dog.expeditionCamp.anchor().pos(),
						dog.blockPosition(), dog.getHealth());
			});
			var initial = new JsonObject();
			initial.addProperty("dog", dogId.toString());
			initial.addProperty("dragon", start.dragon().toString());
			initial.addProperty("dragonHealth", start.dragonHealth());
			initial.add("camp", coordinates(start.mat()));
			initial.add("shelter", coordinates(start.shelter()));
			Files.writeString(status.resolveSibling("archived-end-start.json"), initial.toString());
			Files.writeString(status, "ready");

			boolean victory = false;
			try {
				for (int tick = 0; tick < 36_000; tick += 5) {
					String result = Files.readString(status);
					if ("failed".equals(result)) break;
					if ("victory".equals(result) && !victory) {
						verifyVictory(server, ownerId, dogId, start);
						context.takeScreenshot("expedition-survival-end-return-victory");
						Files.writeString(status.resolveSibling("native-end-victory"), start.dragon().toString());
						victory = true;
					}
					if (victory && context.computeOnClient(client -> client.screen instanceof WinScreen)) {
						ExpeditionTravelClientGameTest.finishPortalTravel(context, world, Level.END, Level.OVERWORLD);
					}
					if ("finished".equals(result) && victory) {
						ExpeditionTravelClientGameTest.assertDog(server, ownerId, dogId, Level.OVERWORLD, Level.OVERWORLD, false);
						context.takeScreenshot("expedition-survival-end-return-home");
						break;
					}
					context.waitTicks(5);
				}
				if (!victory || !"finished".equals(Files.readString(status))) {
					throw new AssertionError("The controller did not return with the original dog after the native victory");
				}
			} catch (AssertionError failure) {
				context.takeScreenshot("expedition-survival-end-return-failure");
				throw failure;
			}
		}
		try (var reopened = save.open()) {
			reopened.getClientWorld().waitForChunksRender();
			ExpeditionTravelClientGameTest.assertDog(reopened.getServer(), ownerId, dogId, Level.OVERWORLD, Level.OVERWORLD, false);
			context.takeScreenshot("expedition-survival-end-return-reopened");
		}
		Files.writeString(status.resolveSibling("end-return-verified"), dogId.toString());
		System.out.printf("Expedition archived End victory, return and reload passed: dog=%s owner=%s%n", dogId, ownerId);
	}

	private static void verifyVictory(TestServerContext server, UUID ownerId, UUID dogId, Start start) {
		server.runOnServer(minecraft -> {
			var owner = minecraft.getPlayerList().getPlayer(ownerId);
			var end = minecraft.getLevel(Level.END);
			var exit = end.getDragonFight().saveData().exitPortalLocation().orElseThrow();
			if (owner == null || !owner.isAlive() || !owner.level().dimension().equals(Level.END)
					|| !end.getDragonFight().saveData().dragonKilled() || end.getEntity(start.dragon()) != null
					|| !BlockPos.betweenClosedStream(exit.offset(-3, 0, -3), exit.offset(3, 1, 3))
							.anyMatch(pos -> end.getBlockState(pos).is(Blocks.END_PORTAL))
					|| !(end.getEntity(dogId) instanceof MushroomYorkieEntity dog) || !dog.isAlive()
					|| !dog.belongsTo(owner) || !dog.isOrderedToSit() || dog.getHealth() < start.dogHealth()
					|| !dog.blockPosition().equals(start.shelter())) {
				throw new AssertionError("Expected the original dragon gone, native exit open, and original dog unharmed at shelter");
			}
		});
	}

	private static JsonArray coordinates(BlockPos pos) {
		var result = new JsonArray();
		result.add(pos.getX());
		result.add(pos.getY());
		result.add(pos.getZ());
		return result;
	}

	private record Start(UUID dragon, float dragonHealth, BlockPos mat, BlockPos shelter, float dogHealth) {
	}
}
