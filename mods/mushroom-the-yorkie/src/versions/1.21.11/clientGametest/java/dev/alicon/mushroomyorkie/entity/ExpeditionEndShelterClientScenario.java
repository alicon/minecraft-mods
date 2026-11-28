package dev.alicon.mushroomyorkie.entity;

import java.util.Locale;
import java.util.UUID;
import java.util.stream.IntStream;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerContext;
import net.minecraft.client.gui.screens.DeathScreen;
import net.minecraft.commands.arguments.EntityAnchorArgument;
import net.minecraft.core.BlockPos;
import net.minecraft.core.GlobalPos;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.core.particles.PowerParticleOption;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.AreaEffectCloud;
import net.minecraft.world.entity.boss.enderdragon.EnderDragon;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.Vec3;

final class ExpeditionEndShelterClientScenario {
	static final GlobalPos CAMP = GlobalPos.of(Level.END, new BlockPos(98, 64, 1));

	private ExpeditionEndShelterClientScenario() {
	}

	static void shelterThroughOwnerDeath(ClientGameTestContext context, TestServerContext server, UUID ownerId, UUID dogId) {
		String runInEnd = "execute in minecraft:the_end run ";
		server.runCommand(runInEnd + "forceload add 94 -4 108 8");
		server.runOnServer(minecraft -> {
			var end = minecraft.getLevel(Level.END);
			for (int x = 5; x <= 6; x++) {
				for (int z = -1; z <= 0; z++) {
					end.getChunk(x, z);
				}
			}
		});
		server.runCommand(runInEnd + "fill 94 63 -4 108 63 8 minecraft:stone");
		server.runCommand(runInEnd + "fill 94 64 -4 108 66 8 minecraft:air");
		server.runCommand(runInEnd + "fill 95 67 -3 107 67 7 minecraft:stone");
		server.runCommand(runInEnd + "setblock 97 64 2 minecraft:torch");
		server.runCommand(runInEnd + "tp @a 100.5 64 3.5");
		server.runOnServer(minecraft -> {
			var dog = (MushroomYorkieEntity) minecraft.getLevel(Level.END).getEntity(dogId);
			dog.setNoAi(true);
			dog.setPos(103.5, 64, 1.5);
			dog.getNavigation().stop();
		});
		context.waitFor(client -> client.player.blockPosition().equals(new BlockPos(100, 64, 3)));
		ExpeditionCampClientScenario.placeAndMark(context, server, ownerId, dogId, Level.END, CAMP.pos());
		UUID cloudId = spawnBreath(context, server, dogId);
		for (int tick = 0; tick < 150; tick += 5) {
			if (sheltered(server, ownerId, dogId)) {
				break;
			}
			context.waitTicks(5);
		}
		if (!sheltered(server, ownerId, dogId)) {
			throw new AssertionError("Mushroom did not get to the marked camp during dragon breath");
		}
		server.runOnServer(minecraft -> {
			var cloud = minecraft.getLevel(Level.END).getEntity(cloudId);
			if (cloud != null) {
				cloud.discard();
			}
		});
		server.runCommand("kill @a");
		context.waitForScreen(DeathScreen.class);
		context.waitTicks(21);
		context.clickScreenButton("deathScreen.respawn");
		context.waitFor(client -> client.screen == null && client.level != null && client.level.dimension().equals(Level.OVERWORLD)
				&& client.player != null && client.player.isAlive());
		if (!sheltered(server, ownerId, dogId)) {
			throw new AssertionError("The living dog did not wait at the End camp after its owner respawned");
		}
		System.out.println("Expedition End shelter held the original dog during owner death and respawn");
	}

	static void recallInEnd(ClientGameTestContext context, TestServerContext server, UUID dogId) {
		var approach = server.computeOnServer(minecraft -> minecraft.getLevel(Level.END).getEntity(dogId).position().add(2.4, 0, 0));
		server.runCommand(String.format(Locale.ROOT, "execute in minecraft:the_end run tp @a %.4f %.4f %.4f",
				approach.x, approach.y, approach.z));
		context.waitFor(client -> client.player.position().distanceToSqr(approach) < 0.04);
		recallFromReach(context, server, dogId);
	}

	static void recallFromReach(ClientGameTestContext context, TestServerContext server, UUID dogId) {
		int emptySlot = context.computeOnClient(client -> IntStream.range(0, 9)
				.filter(slot -> client.player.getInventory().getItem(slot).isEmpty()).findFirst().orElseThrow());
		context.getInput().pressKey(options -> options.keyHotbarSlots[emptySlot]);
		context.waitFor(client -> client.player.getMainHandItem().isEmpty());
		for (int attempt = 0; attempt <= 3; attempt++) {
			var aim = server.computeOnServer(minecraft -> {
				var dog = (MushroomYorkieEntity) minecraft.getLevel(Level.END).getEntity(dogId);
				if (dog == null || !dog.isAlive()) throw new AssertionError("The original End companion is missing");
				return dog.isHoldingExpeditionShelter() || dog.isOrderedToSit() || dog.isCurledUpSleeping()
						? dog.getBoundingBox().getCenter() : null;
			});
			if (aim == null) {
				System.out.println("Expedition original dog is following in the End");
				return;
			}
			if (attempt == 3) break;
			context.runOnClient(client -> client.player.lookAt(EntityAnchorArgument.Anchor.EYES, aim));
			context.waitFor(client -> client.hitResult instanceof EntityHitResult hit && hit.getEntity().getUUID().equals(dogId));
			context.getInput().pressKey(options -> options.keyUse);
			context.waitTicks(5);
		}
		throw new AssertionError("The returned owner could not recall Mushroom for the exit");
	}

	private static UUID spawnBreath(ClientGameTestContext context, TestServerContext server, UUID dogId) {
		for (int tick = 0; tick < 200; tick += 5) {
			UUID cloudId = server.computeOnServer(minecraft -> {
				var end = minecraft.getLevel(Level.END);
				var dragon = end.getDragonFight().getDragonUUID();
				if (dragon == null || !(end.getEntity(dragon) instanceof EnderDragon owner)) {
					return null;
				}
				var dog = (MushroomYorkieEntity) end.getEntity(dogId);
				var cloud = new AreaEffectCloud(end, dog.getX(), dog.getY(), dog.getZ());
				cloud.setOwner(owner);
				cloud.setCustomParticle(PowerParticleOption.create(ParticleTypes.DRAGON_BREATH, 1.0F));
				cloud.setRadius(2);
				cloud.setWaitTime(0);
				cloud.setDuration(120);
				cloud.addEffect(new MobEffectInstance(MobEffects.INSTANT_DAMAGE, 1));
				end.addFreshEntity(cloud);
				dog.setNoAi(false);
				return cloud.getUUID();
			});
			if (cloudId != null) {
				return cloudId;
			}
			context.waitTicks(5);
		}
		throw new AssertionError("End fight did not load a dragon for the shelter fixture");
	}

	private static boolean sheltered(TestServerContext server, UUID ownerId, UUID dogId) {
		return server.computeOnServer(minecraft -> {
			var dog = (MushroomYorkieEntity) minecraft.getLevel(Level.END).getEntity(dogId);
			var owner = minecraft.getPlayerList().getPlayer(ownerId);
			return dog != null && dog.isAlive() && dog.belongsTo(owner) && dog.isHoldingExpeditionShelter()
					&& dog.distanceToSqr(Vec3.atBottomCenterOf(CAMP.pos())) <= 1;
		});
	}
}
