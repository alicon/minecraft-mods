package dev.alicon.mushroomyorkie.entity;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicReference;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerContext;
import net.fabricmc.fabric.api.client.gametest.v1.world.TestWorldBuilder;
import net.fabricmc.fabric.api.entity.event.v1.ServerLivingEntityEvents;
import net.minecraft.world.Difficulty;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.entity.EntityTypeTest;

final class ExpeditionReunionClientScenario {
	private ExpeditionReunionClientScenario() {
	}

	static void run(ClientGameTestContext context, TestWorldBuilder builder, ExpeditionSaveRecovery recovery, Path status)
			throws IOException {
		var reunion = Objects.requireNonNull(recovery.reunion(), "Missing reunion observation");
		var sighting = reunion.getAsJsonArray("lastSeen");
		float previousHealth = reunion.get("health").getAsFloat();
		if (sighting.size() != 3 || !Float.isFinite(previousHealth) || previousHealth <= 0) {
			throw new AssertionError("Invalid saved reunion observation");
		}
		var death = new AtomicReference<String>();
		ServerLivingEntityEvents.AFTER_DEATH.register((entity, damage) -> {
			if (entity.getUUID().equals(recovery.dog())) {
				death.set(damage.getLocalizedDeathMessage(entity).getString());
			}
		});
		try (var world = recovery.openCopy(builder)) {
			world.getClientWorld().waitForChunksRender();
			var server = world.getServer();
			server.runOnServer(minecraft -> {
				var owner = minecraft.getPlayerList().getPlayer(recovery.owner());
				if (owner == null || !owner.isAlive() || owner.isCreative() || owner.isSpectator()
						|| !owner.level().dimension().equals(Level.OVERWORLD)
						|| minecraft.overworld().getSeed() != recovery.seed()
						|| !minecraft.getWorldData().getLevelName().equals("Codex Expedition Survival")
						|| minecraft.getWorldData().isAllowCommands()
						|| minecraft.getWorldData().getDifficulty() != Difficulty.NORMAL) {
					throw new AssertionError("The reunion did not open the recorded Normal Survival save and owner");
				}
			});
			var evidence = reunion.deepCopy();
			evidence.addProperty("dog", recovery.dog().toString());
			evidence.add("bed", recovery.camp().get("bed"));
			Files.writeString(status.resolveSibling("reunion-start.json"), evidence.toString());
			Files.writeString(status, "ready");
			try {
				verifyReunion(context, world.getServer(), recovery, status, previousHealth, death);
			} catch (AssertionError failure) {
				context.takeScreenshot("expedition-survival-reunion-failure");
				throw failure;
			}
		}
	}

	private static void verifyReunion(ClientGameTestContext context, TestServerContext server, ExpeditionSaveRecovery recovery,
			Path status, float previousHealth, AtomicReference<String> death) throws IOException {
		boolean observedDaylight = false;
		for (int tick = 0; tick < 17_000; tick += 10) {
			String result = Files.readString(status);
			if (death.get() != null) throw new AssertionError("The original Mushroom died before reunion: " + death.get());
			if ("failed".equals(result)) break;
			if ("reunion-daylight".equals(result) && !observedDaylight) {
				server.runOnServer(minecraft -> {
					var owner = minecraft.getPlayerList().getPlayer(recovery.owner());
					if (owner == null || !owner.isAlive() || owner.level().getDayTime() % 24_000 >= 12_000
							|| !owner.level().getEntities(EntityTypeTest.forClass(MushroomYorkieEntity.class),
									owner.getBoundingBox().inflate(24), dog -> dog.isAlive() && dog.belongsTo(owner)
											&& !dog.getUUID().equals(recovery.dog())).isEmpty()) {
						throw new AssertionError("Expected daylight with no replacement for the original Mushroom");
					}
				});
				Files.writeString(status.resolveSibling("native-reunion-daylight"), recovery.dog().toString());
				observedDaylight = true;
			}
			if ("finished".equals(result)) {
				if (!observedDaylight) throw new AssertionError("The server did not verify the daylight start");
				float health = server.computeOnServer(minecraft -> {
					var owner = minecraft.getPlayerList().getPlayer(recovery.owner());
					if (owner == null || !owner.isAlive() || !owner.level().dimension().equals(Level.OVERWORLD)
							|| !(owner.level().getEntity(recovery.dog()) instanceof MushroomYorkieEntity dog)
							|| !dog.isAlive() || !dog.belongsTo(owner) || dog.getHealth() <= previousHealth
							|| dog.distanceTo(owner) > 6 || owner.level().getDayTime() % 24_000 >= 12_000) {
						throw new AssertionError("Expected the original injured dog healed beside his owner in daylight");
					}
					return dog.getHealth();
				});
				context.takeScreenshot("expedition-survival-reunion");
				System.out.printf("Expedition native reunion passed: dog=%s owner=%s health=%.2f -> %.2f%n",
						recovery.dog(), recovery.owner(), previousHealth, health);
				return;
			}
			context.waitTicks(10);
		}
		throw new AssertionError("The original dog was not reunited and fed through normal play");
	}
}
