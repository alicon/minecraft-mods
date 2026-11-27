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
		TestWorldSave save;
		UUID ownerId;
		UUID dogId;
		try (var world = context.worldBuilder().create()) {
			world.getClientWorld().waitForChunksRender();
			save = world.getWorldSave();
			var server = world.getServer();
			ownerId = context.computeOnClient(client -> client.player.getUUID());
			try {
				dogId = adoptAfterSleep(context, server, ownerId);
				walkThroughPortal(context, world, ownerId, dogId, Level.NETHER, new BlockPos(16, 90, 16));
				walkThroughPortal(context, world, ownerId, dogId, Level.OVERWORLD, new BlockPos(24, 95, 24));
				walkThroughPortal(context, world, ownerId, dogId, Level.END, new BlockPos(48, 90, 48));
				walkThroughPortal(context, world, ownerId, dogId, Level.OVERWORLD, new BlockPos(112, 65, 0));
			} catch (RuntimeException | AssertionError exception) {
				context.takeScreenshot("expedition-travel-failure");
				throw exception;
			}
		}
		try (var reopened = save.open()) {
			reopened.getClientWorld().waitForChunksRender();
			try {
				assertDog(reopened.getServer(), ownerId, dogId, Level.OVERWORLD);
			} catch (AssertionError failure) {
				context.takeScreenshot("expedition-reopen-failure");
				throw failure;
			}
			System.out.printf("Expedition rejoin passed: dog=%s save=%s%n", dogId, save.getSaveDirectory());
			context.takeScreenshot("expedition-rejoin");
		}
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
		server.runCommand("gamerule minecraft:advance_time true");
		server.runCommand("time set midnight");
		var bed = new BlockPos(16, 90, 18);
		context.waitFor(client -> client.level.getBlockState(bed).getBlock() instanceof BedBlock);
		context.runOnClient(client -> client.player.lookAt(EntityAnchorArgument.Anchor.EYES, Vec3.atCenterOf(bed)));
		context.waitFor(client -> client.hitResult instanceof BlockHitResult hit && bed.equals(hit.getBlockPos()));
		context.getInput().pressKey(options -> options.keyUse);
		context.waitFor(client -> client.player.isSleeping());
		context.waitFor(client -> !client.player.isSleeping(), 220);
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

	private static void walkThroughPortal(ClientGameTestContext context, TestSingleplayerContext world,
			UUID ownerId, UUID dogId, ResourceKey<Level> target, BlockPos staging) {
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
		if (origin.equals(Level.END)) {
			context.waitFor(client -> client.screen instanceof WinScreen
					|| client.level != null && client.level.dimension().equals(target), PORTAL_WAIT_TICKS);
			if (context.computeOnClient(client -> client.screen instanceof WinScreen)) {
				input.pressKey(GLFW.GLFW_KEY_ESCAPE);
			}
		}
		context.waitFor(client -> client.screen == null && client.level != null && client.player != null
				&& client.level.dimension().equals(target), PORTAL_WAIT_TICKS);
		world.getClientWorld().waitForChunksRender();
		assertDog(server, ownerId, dogId, target);
		System.out.printf("Expedition portal passed: %s -> %s dog=%s%n", origin.identifier(), target.identifier(), dogId);
		context.takeScreenshot("expedition-from-" + origin.identifier().getPath() + "-to-" + target.identifier().getPath());
	}

	private static void assertDog(TestServerContext server, UUID ownerId, UUID dogId, ResourceKey<Level> target) {
		server.runOnServer(minecraft -> {
			var owner = owner(minecraft, ownerId);
			var owned = dogs(minecraft, owner);
			if (!owner.level().dimension().equals(target) || owned.size() != 1
					|| !owned.getFirst().isAlive() || !owned.getFirst().getUUID().equals(dogId)
					|| !owned.getFirst().level().dimension().equals(target)) {
				throw new AssertionError("Expected original living dog " + dogId + " at " + target.identifier()
						+ " with its owner, observed "
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
