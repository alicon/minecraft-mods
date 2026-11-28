package dev.alicon.mushroomyorkie.entity;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.fabricmc.fabric.api.client.gametest.v1.world.TestWorldSave;
import net.minecraft.client.gui.screens.WinScreen;
import net.minecraft.commands.arguments.EntityAnchorArgument;
import net.minecraft.core.BlockPos;
import net.minecraft.core.GlobalPos;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.BedBlock;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.entity.EntityTypeTest;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;
import org.lwjgl.glfw.GLFW;

public final class ExpeditionTravelClientGameTest implements FabricClientGameTest {
	private static final int PORTAL_WAIT_TICKS = 600;

	@Override
	public void runTest(ClientGameTestContext context) {
		if (!Boolean.getBoolean("mushroom.expedition.clientTest")) {
			return;
		}
		boolean pauseOnLostFocus = context.computeOnClient(client -> client.options.pauseOnLostFocus);
		context.runOnClient(client -> client.options.pauseOnLostFocus = false);
		try {
			if ("1".equals(System.getenv("MUSHROOM_EXPEDITION_SLEEP_OWNERSHIP_ONLY"))) {
				sleepWithUnloadedCompanion(context);
			} else {
				travelAndReopen(context);
			}
		} finally {
			context.runOnClient(client -> client.options.pauseOnLostFocus = pauseOnLostFocus);
		}
	}

	private static void travelAndReopen(ClientGameTestContext context) {
		TestWorldSave save;
		UUID ownerId;
		UUID dogId;
		GlobalPos finalCamp;
		try (var world = context.worldBuilder().create()) {
			world.getClientWorld().waitForChunksRender();
			save = world.getWorldSave();
			var server = world.getServer();
			ownerId = context.computeOnClient(client -> client.player.getUUID());
			try {
				dogId = adoptAfterSleep(context, server, ownerId);
				ExpeditionGuideClientScenario.practice(context, server, ownerId, dogId);
				ExpeditionVestClientScenario.equipAndInspect(context, server, ownerId, dogId);
				ExpeditionCampClientScenario.placeAndMark(context, server, ownerId, dogId);
				walkThroughPortal(context, world, ownerId, dogId, Level.NETHER, new BlockPos(16, 90, 16), false);
				walkThroughPortal(context, world, ownerId, dogId, Level.OVERWORLD, new BlockPos(24, 95, 24), false);
				walkThroughPortal(context, world, ownerId, dogId, Level.END, new BlockPos(48, 90, 48), false);
				ExpeditionEndShelterClientScenario.shelterThroughOwnerDeath(context, server, ownerId, dogId);
				walkThroughPortal(context, world, ownerId, dogId, Level.END, new BlockPos(48, 90, 48), false);
				ExpeditionEndShelterClientScenario.recallInEnd(context, server, dogId);
				finalCamp = ExpeditionEndVictoryClientScenario.finishAndReturn(context, world, ownerId, dogId);
			} catch (RuntimeException | AssertionError exception) {
				context.takeScreenshot("expedition-travel-failure");
				throw exception;
			}
		}
		try (var reopened = save.open()) {
			reopened.getClientWorld().waitForChunksRender();
			try {
				assertDog(reopened.getServer(), ownerId, dogId, Level.OVERWORLD, Level.OVERWORLD, false);
				ExpeditionVestClientScenario.assertPlated(reopened.getServer(), ownerId, dogId);
				ExpeditionGuideClientScenario.checkReopened(context, reopened.getServer(), ownerId, dogId);
				ExpeditionCampClientScenario.assertMarked(reopened.getServer(), dogId, finalCamp);
				if (!reopened.getServer().computeOnServer(minecraft -> minecraft.getLevel(Level.END)
						.getDragonFight().saveData().dragonKilled())) {
					throw new AssertionError("The native dragon victory did not survive reopening");
				}
				System.out.printf("Expedition rejoin passed: dog=%s save=%s%n", dogId, save.getSaveDirectory());
				context.takeScreenshot("expedition-rejoin");
				askDogToSit(context, reopened.getServer(), dogId);
				walkThroughPortal(context, reopened, ownerId, dogId, Level.NETHER, new BlockPos(16, 90, 16), true);
			} catch (AssertionError failure) {
				context.takeScreenshot("expedition-reopen-failure");
				throw failure;
			}
		}
	}

	private static void askDogToSit(ClientGameTestContext context, TestServerContext server, UUID dogId) {
		server.runCommand("tp @a 16.5 90 17.5");
		server.runOnServer(minecraft -> {
			var dog = (MushroomYorkieEntity) minecraft.overworld().getEntity(dogId);
			dog.setPos(16.5, 90.0, 15.2);
			dog.getNavigation().stop();
		});
		int emptySlot = context.computeOnClient(client -> {
			for (int slot = 0; slot < 9; slot++) {
				if (client.player.getInventory().getItem(slot).isEmpty()) return slot;
			}
			throw new AssertionError("The sit cue fixture needs an empty hotbar slot");
		});
		context.getInput().pressKey(options -> options.keyHotbarSlots[emptySlot]);
		context.waitFor(client -> client.screen == null && client.player.getMainHandItem().isEmpty()
				&& client.player.blockPosition().equals(new BlockPos(16, 90, 17)));
		for (int cue = 0; cue < 4; cue++) {
			ExpeditionGuideClientScenario.aimAtDog(context, dogId);
			context.getInput().pressKey(options -> options.keyUse);
			for (int tick = 0; tick < 6; tick++) {
				if (server.computeOnServer(minecraft -> ((MushroomYorkieEntity) minecraft.overworld().getEntity(dogId)).isOrderedToSit())) {
					System.out.printf("Expedition native sit cue passed: dog=%s uses=%s%n", dogId, cue + 1);
					return;
				}
				context.waitTick();
			}
		}
		throw new AssertionError("Native empty-hand Use did not order Mushroom to sit");
	}

	private static UUID adoptAfterSleep(ClientGameTestContext context, TestServerContext server, UUID ownerId) {
		server.runOnServer(minecraft -> {
			var owner = owner(minecraft, ownerId);
			if (owner.isCreative() || owner.isSpectator() || !owner.getInventory().isEmpty()
					|| !dogs(minecraft, owner).isEmpty()) {
				throw new AssertionError("Expected a fresh Survival player with no gear or dog");
			}
			System.out.printf("Expedition baseline: difficulty=%s seed=%s owner=%s%n",
					minecraft.getWorldData().getDifficulty(), minecraft.overworld().getSeed(), ownerId);
		});
		server.runCommand("fill 12 89 12 20 89 20 minecraft:stone");
		server.runCommand("tp @a 16.5 90 16.5");
		server.runCommand("setblock 16 90 18 minecraft:white_bed[facing=south,part=foot]");
		server.runCommand("setblock 16 90 19 minecraft:white_bed[facing=south,part=head]");
		sleepAtBed(context, server);
		return server.computeOnServer(minecraft -> {
			var owned = dogs(minecraft, owner(minecraft, ownerId));
			if (owned.size() != 1 || !owned.getFirst().isAlive()) {
				throw new AssertionError("A successful Survival sleep should adopt one living dog, found " + owned.size());
			}
			var dogId = owned.getFirst().getUUID();
			System.out.println("Expedition adoption passed: dog=" + dogId);
			return dogId;
		});
	}

	private static void sleepWithUnloadedCompanion(ClientGameTestContext context) {
		TestWorldSave save;
		UUID ownerId;
		UUID dogId;
		try (var world = context.worldBuilder().create()) {
			world.getClientWorld().waitForChunksRender();
			save = world.getWorldSave();
			ownerId = context.computeOnClient(client -> client.player.getUUID());
			var server = world.getServer();
			dogId = adoptAfterSleep(context, server, ownerId);
			server.runCommand("forceload add 2048 0");
			server.runCommand("fill 2047 89 0 2049 89 2 minecraft:stone");
			server.runOnServer(minecraft -> {
				var dog = (MushroomYorkieEntity) minecraft.overworld().getEntity(dogId);
				dog.setNoAi(true);
				dog.teleportTo(2048.5, 90, 0.5);
			});
			server.runCommand("forceload remove 2048 0");
		}
		try (var world = save.open()) {
			world.getClientWorld().waitForChunksRender();
			var server = world.getServer();
			if (server.computeOnServer(minecraft -> minecraft.overworld().getEntity(dogId) != null)) {
				throw new AssertionError("The original Mushroom is still loaded after reopening");
			}
			server.runCommand("tp @a 16.5 90 16.5");
			sleepAtBed(context, server);
			if (!server.computeOnServer(minecraft -> dogs(minecraft, owner(minecraft, ownerId)).isEmpty())) {
				throw new AssertionError("Sleeping spawned a duplicate while the original Mushroom was still alive");
			}
			server.runCommand("forceload add 2048 0");
			boolean originalLoaded = false;
			for (int tick = 0; tick < 300 && !originalLoaded; tick += 5) {
				originalLoaded = server.computeOnServer(minecraft ->
						minecraft.overworld().getEntity(dogId) instanceof MushroomYorkieEntity dog
								&& dog.isAlive() && dog.belongsTo(owner(minecraft, ownerId)));
				if (!originalLoaded) context.waitTicks(5);
			}
			if (!originalLoaded) {
				throw new AssertionError("The distant chunk did not load the original living Mushroom");
			}
			server.runCommand("kill " + dogId);
			context.waitTicks(25);
			server.runCommand("tp @a 16.5 90 16.5");
			sleepAtBed(context, server);
			server.runOnServer(minecraft -> {
				var owned = dogs(minecraft, owner(minecraft, ownerId));
				if (owned.size() != 1 || dogId.equals(owned.getFirst().getUUID())) {
					throw new AssertionError("Sleep should replace Mushroom after his death in the default mode");
				}
				System.out.printf("Expedition sleep ownership passed: original=%s replacement=%s%n",
						dogId, owned.getFirst().getUUID());
			});
		}
	}

	private static void sleepAtBed(ClientGameTestContext context, TestServerContext server) {
		server.runCommand("gamerule minecraft:advance_time true");
		server.runCommand("time set midnight");
		var bed = new BlockPos(16, 90, 18);
		context.waitFor(client -> client.screen == null && client.player.blockPosition().equals(new BlockPos(16, 90, 16))
				&& client.level.getBlockState(bed).getBlock() instanceof BedBlock);
		context.runOnClient(client -> client.player.lookAt(EntityAnchorArgument.Anchor.EYES, Vec3.atCenterOf(bed)));
		context.waitFor(client -> client.hitResult instanceof BlockHitResult hit && bed.equals(hit.getBlockPos()));
		context.getInput().pressKey(options -> options.keyUse);
		context.waitFor(client -> client.player.isSleeping());
		context.waitFor(client -> !client.player.isSleeping(), 220);
	}

	private static void walkThroughPortal(ClientGameTestContext context, TestSingleplayerContext world,
			UUID ownerId, UUID dogId, ResourceKey<Level> target, BlockPos staging, boolean sitting) {
		TestServerContext server = world.getServer();
		var origin = server.computeOnServer(minecraft -> owner(minecraft, ownerId).level().dimension());
		int x = staging.getX();
		int y = staging.getY();
		int z = staging.getZ();
		String here = "execute in " + origin.identifier() + " run ";
		server.runCommand(here + "forceload add %d %d %d %d".formatted(x - 2, z - 2, x + 3, z + 5));
		server.runOnServer(minecraft -> {
			var level = minecraft.getLevel(origin);
			for (int chunkX = (x - 2) >> 4; chunkX <= (x + 3) >> 4; chunkX++) {
				for (int chunkZ = (z - 2) >> 4; chunkZ <= (z + 5) >> 4; chunkZ++) {
					level.getChunk(chunkX, chunkZ);
				}
			}
		});
		server.runCommand(here + "fill %d %d %d %d %d %d minecraft:obsidian".formatted(x - 2, y - 1, z - 2, x + 3, y - 1, z + 5));
		server.runCommand(here + "fill %d %d %d %d %d %d minecraft:air".formatted(x - 2, y, z - 2, x + 3, y + 4, z + 5));
		boolean netherPortal = origin.equals(Level.NETHER) || target.equals(Level.NETHER);
		if (netherPortal) {
			server.runCommand(here + "fill %d %d %d %d %d %d minecraft:obsidian".formatted(x - 1, y - 1, z + 3, x + 2, y + 3, z + 3));
			server.runCommand(here + "fill %d %d %d %d %d %d minecraft:nether_portal[axis=x]".formatted(x, y, z + 3, x + 1, y + 2, z + 3));
		} else {
			server.runCommand(here + "setblock %d %d %d minecraft:end_portal".formatted(x, y, z + 3));
		}
		server.runOnServer(minecraft -> {
			var level = minecraft.getLevel(origin);
			if (!level.getBlockState(new BlockPos(x, y - 1, z + 1)).is(Blocks.OBSIDIAN)
					|| !level.getBlockState(new BlockPos(x, y, z + 3)).is(netherPortal ? Blocks.NETHER_PORTAL : Blocks.END_PORTAL)) {
				throw new AssertionError("The portal fixture is incomplete in " + origin.identifier());
			}
		});
		server.runCommand(here + "tp @a %.1f %d %.1f 0 0".formatted(x + 0.5, y, z + 1.5));
		context.waitFor(client -> client.level.dimension().equals(origin) && client.player.blockPosition().equals(new BlockPos(x, y, z + 1)));
		// Let the client's movement and the destination's portal arrive before attempting input.
		context.waitTicks(5);
		var input = context.getInput();
		input.holdKey(options -> options.keyUp);
		try {
			context.waitFor(client -> client.player != null && (client.player.getZ() >= z + 3.1
					|| !client.level.dimension().equals(origin)) || client.screen instanceof WinScreen, 40);
		} finally {
			input.releaseKey(options -> options.keyUp);
		}
		finishPortalTravel(context, world, origin, target);
		assertDog(server, ownerId, dogId, target, sitting ? origin : target, sitting);
		System.out.printf("Expedition portal passed: %s -> %s dog=%s sitting=%s%n", origin.identifier(), target.identifier(), dogId, sitting);
		if (!sitting) {
			context.takeScreenshot("expedition-from-" + origin.identifier().getPath() + "-to-" + target.identifier().getPath());
		}
	}

	static void finishPortalTravel(ClientGameTestContext context, TestSingleplayerContext world,
			ResourceKey<Level> origin, ResourceKey<Level> target) {
		if (origin.equals(Level.END)) {
			context.waitFor(client -> client.screen instanceof WinScreen
					|| client.level != null && client.level.dimension().equals(target), PORTAL_WAIT_TICKS);
			if (context.computeOnClient(client -> client.screen instanceof WinScreen)) {
				context.getInput().pressKey(GLFW.GLFW_KEY_ESCAPE);
			}
		}
		context.waitFor(client -> client.screen == null && client.level != null && client.player != null
				&& client.level.dimension().equals(target), PORTAL_WAIT_TICKS);
		world.getClientWorld().waitForChunksRender();
	}

	static void assertDog(TestServerContext server, UUID ownerId, UUID dogId,
			ResourceKey<Level> playerDimension, ResourceKey<Level> dogDimension, boolean sitting) {
		server.runOnServer(minecraft -> {
			var owner = owner(minecraft, ownerId);
			var owned = dogs(minecraft, owner);
			if (!owner.level().dimension().equals(playerDimension) || owned.size() != 1
					|| !owned.getFirst().isAlive() || !owned.getFirst().getUUID().equals(dogId)
					|| !owned.getFirst().level().dimension().equals(dogDimension)
					|| owned.getFirst().isOrderedToSit() != sitting) {
				throw new AssertionError("Expected original living dog " + dogId + " at " + dogDimension.identifier()
						+ " sitting=" + sitting + ", observed "
						+ owned.stream().map(dog -> dog.getUUID() + "@" + dog.level().dimension().identifier()).toList());
			}
		});
	}

	private static ServerPlayer owner(MinecraftServer server, UUID id) {
		var owner = server.getPlayerList().getPlayer(id);
		if (owner == null || !owner.isAlive()) {
			throw new AssertionError("Expedition owner is missing or dead");
		}
		return owner;
	}

	private static List<MushroomYorkieEntity> dogs(MinecraftServer server, ServerPlayer owner) {
		List<MushroomYorkieEntity> owned = new ArrayList<>();
		for (var level : server.getAllLevels()) {
			owned.addAll(level.getEntities(EntityTypeTest.forClass(MushroomYorkieEntity.class), dog -> dog.belongsTo(owner)));
		}
		return owned;
	}
}
