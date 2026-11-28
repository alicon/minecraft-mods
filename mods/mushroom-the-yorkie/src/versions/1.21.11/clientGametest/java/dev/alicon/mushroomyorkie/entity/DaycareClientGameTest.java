package dev.alicon.mushroomyorkie.entity;

import java.time.Duration;
import java.util.HashMap;
import java.util.Objects;
import java.util.Properties;
import java.util.UUID;
import java.util.function.Function;

import com.mojang.blaze3d.platform.InputConstants;
import dev.alicon.mushroomyorkie.item.ModItems;
import dev.alicon.mushroomyorkie.pet.PetNeeds;

import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestDedicatedServerContext;
import net.fabricmc.fabric.api.event.player.UseEntityCallback;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Options;
import net.minecraft.client.gui.screens.ConnectScreen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.client.multiplayer.resolver.ServerAddress;
import net.minecraft.commands.arguments.EntityAnchorArgument;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.phys.EntityHitResult;
import org.lwjgl.glfw.GLFW;

public final class DaycareClientGameTest implements FabricClientGameTest {
	private static final String DOG_OWNER = "DaycareGuest";
	private static final int SERVER_PORT = 57341;
	private static final String SERVER_ADDRESS = "127.0.0.1:" + SERVER_PORT;

	@Override
	public void runTest(ClientGameTestContext context) {
		if (Boolean.getBoolean("mushroom.expedition.clientTest") || Boolean.getBoolean("mushroom.expedition.survivalTest")) {
			return;
		}
		if (Boolean.getBoolean("mushroom.daycare.ownerTest")) {
			try {
				driveOwner(context);
			} catch (AssertionError | RuntimeException failure) {
				context.takeScreenshot("daycare-owner-failure");
				throw failure;
			}
			return;
		}
		boolean activeOwner = "1".equals(System.getenv("MUSHROOM_DAYCARE_ACTIVE_OWNER"));
		int soakSeconds = Integer.parseInt(System.getenv().getOrDefault("MUSHROOM_DAYCARE_SOAK_SECONDS", "0"));
		if (soakSeconds != 0 && (soakSeconds < 90 || soakSeconds > 14400)) {
			throw new IllegalArgumentException("Set MUSHROOM_DAYCARE_SOAK_SECONDS from 90 to 14400 seconds");
		}
		var settings = new Properties();
		settings.setProperty("server-ip", "127.0.0.1");
		settings.setProperty("server-port", Integer.toString(SERVER_PORT));
		settings.setProperty("max-players", "2");
		settings.setProperty("motd", "Mushroom Daycare Client GameTest");
		try (var server = context.worldBuilder().createServer(settings); var connection = server.connect()) {
			connection.getClientWorld().waitForChunksRender();
			var walkerId = context.computeOnClient(client -> client.player.getUUID());
			System.out.println("Daycare ready for DaycareGuest at " + SERVER_ADDRESS);
			long deadline = System.nanoTime() + Duration.ofSeconds(90).toNanos();
			while (!server.computeOnServer(mc -> mc.getPlayerList().getPlayerByName(DOG_OWNER) != null)) {
				if (System.nanoTime() >= deadline) {
					throw new IllegalStateException("DaycareGuest did not join the disposable server");
				}
				context.waitTick();
			}
			try {
				if (activeOwner) {
					while (!server.computeOnServer(mc -> {
						var owner = mc.getPlayerList().getPlayerByName(DOG_OWNER);
						return owner != null && owner.isShiftKeyDown();
					})) {
						if (System.nanoTime() >= deadline) {
							throw new IllegalStateException("Daycare owner did not send native ready input");
						}
						context.waitTick();
					}
				}
				walkBorrowedDog(context, server, walkerId, soakSeconds, activeOwner);
			} catch (AssertionError | RuntimeException failure) {
				context.takeScreenshot("daycare-client-failure");
				throw failure;
			}
			server.runOnServer(mc -> mc.getPlayerList().getPlayerByName(DOG_OWNER).connection
					.disconnect(Component.literal("Daycare test complete")));
			context.waitTicks(10);
		}
	}

	private static void walkBorrowedDog(ClientGameTestContext context, TestDedicatedServerContext server,
			UUID walkerId, int soakSeconds, boolean activeOwner) {
		var ownerId = server.computeOnServer(mc -> mc.getPlayerList().getPlayerByName(DOG_OWNER).getUUID());
		var useTicks = new HashMap<UUID, Long>();
		if (activeOwner) {
			UseEntityCallback.EVENT.register((player, level, hand, entity, hit) -> {
				if (!level.isClientSide() && hand == InteractionHand.MAIN_HAND && entity instanceof MushroomYorkieEntity
						&& (player.getUUID().equals(ownerId) && player.getMainHandItem().is(ModItems.PADDED_VEST)
						|| player.getUUID().equals(walkerId) && player.getMainHandItem().is(Items.LEAD))) {
					if (useTicks.putIfAbsent(player.getUUID(), level.getGameTime()) == null) {
						System.out.printf("Daycare native use: player=%s tick=%d%n", player.getUUID(), level.getGameTime());
					}
				}
				return InteractionResult.PASS;
			});
		}
		var dog = server.computeOnServer(mc -> {
			var walker = Objects.requireNonNull(mc.getPlayerList().getPlayer(walkerId));
			var owner = Objects.requireNonNull(mc.getPlayerList().getPlayer(ownerId));
			if (owner == walker || mc.getPlayerList().isOp(walker.nameAndId()) || walker.isCreative() || walker.isSpectator()) {
				throw new IllegalStateException("Expected two clients and a non-operator Survival walker");
			}
			var yorkie = Objects.requireNonNull(ModEntities.MUSHROOM_YORKIE.create(walker.level(), EntitySpawnReason.TRIGGERED));
			yorkie.setPos(walker.getX(), walker.getY(), walker.getZ() + 2.3);
			yorkie.claimFor(owner);
			yorkie.setHarness(true);
			yorkie.setNoAi(true);
			walker.level().addFreshEntity(yorkie);
			if (activeOwner) {
				owner.teleportTo(walker.getX(), walker.getY(), walker.getZ() + 4.6);
			} else {
				walker.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.LEAD));
			}
			return yorkie;
		});
		var dogId = dog.getUUID();
		var aim = server.computeOnServer(mc -> dog.getBoundingBox().getCenter());
		context.runOnClient(client -> client.player.lookAt(EntityAnchorArgument.Anchor.EYES, aim));
		context.waitFor(client -> client.hitResult instanceof EntityHitResult hit && hit.getEntity().getUUID().equals(dogId));
		if (activeOwner) {
			for (int ticks = 0; ticks <= 120; ticks++) {
				boolean ready = server.computeOnServer(mc -> {
					var owner = Objects.requireNonNull(mc.getPlayerList().getPlayer(ownerId));
					if (owner.isShiftKeyDown()) return false;
					owner.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(ModItems.PADDED_VEST));
					mc.getPlayerList().getPlayer(walkerId).setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.LEAD));
					return true;
				});
				if (ready) break;
				if (ticks == 120) throw new AssertionError("Owner did not aim at Mushroom before the simultaneous Use test");
				context.waitTick();
			}
		}
		context.waitFor(client -> client.player.getMainHandItem().is(Items.LEAD));
		context.getInput().pressKey(options -> options.keyUse);
		context.waitFor(client -> client.player.getMainHandItem().isEmpty());
		if (activeOwner) {
			context.waitFor(client -> client.level.getEntity(dog.getId()) instanceof MushroomYorkieEntity yorkie
					&& yorkie.getItemBySlot(EquipmentSlot.BODY).is(ModItems.PADDED_VEST));
			server.runOnServer(mc -> {
				Long ownerUse = useTicks.get(ownerId);
				Long walkerUse = useTicks.get(walkerId);
				var owner = Objects.requireNonNull(mc.getPlayerList().getPlayer(ownerId));
				var walker = Objects.requireNonNull(mc.getPlayerList().getPlayer(walkerId));
				assertBorrowedDog(dog, owner, walker);
				if (ownerUse == null || walkerUse == null || Math.abs(ownerUse - walkerUse) > 15
						|| !owner.getMainHandItem().isEmpty() || !dog.getItemBySlot(EquipmentSlot.BODY).is(ModItems.PADDED_VEST)) {
					throw new AssertionError("Expected concurrent native owner vest and guest lead at ticks " + ownerUse + " and " + walkerUse);
				}
				System.out.printf("Daycare concurrent use passed: dog=%s ownerUse=%d guestUse=%d%n", dogId, ownerUse, walkerUse);
			});
		}
		server.runOnServer(mc -> {
			dog.needs = new PetNeeds(65, 0, 80, 80);
		});
		feedBorrowedDog(context, server, walkerId, dog, 65);
		server.runOnServer(mc -> {
			if (dog.needs.hunger() != 30 || dog.getLeashHolder() != mc.getPlayerList().getPlayer(walkerId)) {
				throw new AssertionError("Feeding the borrowed dog failed to preserve its lead");
			}
			System.out.println("Daycare guest fed the borrowed Yorkie without dropping the lead");
		});
		context.takeScreenshot("daycare-client-lead");
		var walkerStart = server.computeOnServer(mc -> mc.getPlayerList().getPlayer(walkerId).position());
		var dogStart = server.computeOnServer(mc -> {
			dog.setNoAi(false);
			return dog.position();
		});
		holdMovement(context, options -> options.keyLeft, 30);
		context.waitTicks(10);
		server.runOnServer(mc -> {
			var walker = Objects.requireNonNull(mc.getPlayerList().getPlayer(walkerId));
			var owner = Objects.requireNonNull(mc.getPlayerList().getPlayer(ownerId));
			double walkerMovement = walker.position().distanceTo(walkerStart);
			double dogMovement = dog.position().distanceTo(dogStart);
			assertBorrowedDog(dog, owner, walker);
			if (walkerMovement < 3 || dogMovement < 0.25) {
				throw new AssertionError("Borrowed walk fell short: walker=" + walkerMovement + " dog=" + dogMovement);
			}
			System.out.printf("Daycare walk passed: dog=%s owner=%s walker=%s walkerDistance=%.2f dogDistance=%.2f%n",
					dogId, ownerId, walkerId, walkerMovement, dogMovement);
		});
		context.takeScreenshot("daycare-client-walk");
		if (activeOwner) verifyOwnerRejoin(context, server, ownerId, walkerId, dog);
		if (soakSeconds > 0) {
			soakWalks(context, server, walkerId, ownerId, dog, walkerStart.x(), soakSeconds);
		}
	}

	private static void driveOwner(ClientGameTestContext context) {
		// A keyboard Use binding lets both Mac windows act without sharing the mouse grab.
		context.runOnClient(client -> {
			client.options.keyUse.setKey(InputConstants.Type.KEYSYM.getOrCreate(GLFW.GLFW_KEY_R));
			KeyMapping.resetMapping();
		});
		connectOwner(context);
		context.waitFor(client -> client.player != null && client.screen == null);
		var input = context.getInput();
		input.holdKey(options -> options.keyShift);
		try {
			context.waitFor(DaycareClientGameTest::aimAtOwnedDog);
		} finally {
			input.releaseKey(options -> options.keyShift);
		}
		context.waitFor(client -> client.player.getMainHandItem().is(ModItems.PADDED_VEST)
				&& !client.player.isCrouching() && aimAtOwnedDog(client));
		input.pressKey(options -> options.keyUse);
		context.waitFor(client -> client.player != null && client.player.getMainHandItem().isEmpty());
		context.takeScreenshot("daycare-owner-vest");
		context.waitFor(client -> client.level == null, 1200);
		connectOwner(context);
		context.waitFor(client -> client.player != null && client.screen == null);
		context.waitFor(client -> {
			for (var entity : client.level.entitiesForRendering()) {
				if (entity instanceof MushroomYorkieEntity dog && dog.isOwnedBy(client.player)
						&& dog.getItemBySlot(EquipmentSlot.BODY).is(ModItems.PADDED_VEST)) return true;
			}
			return false;
		});
		context.takeScreenshot("daycare-owner-rejoined");
		input.holdKey(options -> options.keyShift);
		try {
			context.waitFor(client -> client.level == null, 6000);
		} finally {
			input.releaseKey(options -> options.keyShift);
		}
		context.runOnClient(client -> client.setScreen(new TitleScreen()));
	}

	private static boolean aimAtOwnedDog(Minecraft client) {
		if (client.hitResult instanceof EntityHitResult hit && hit.getEntity() instanceof MushroomYorkieEntity dog
				&& dog.isOwnedBy(client.player)) return true;
		for (var entity : client.level.entitiesForRendering()) {
			if (entity instanceof MushroomYorkieEntity dog && dog.isOwnedBy(client.player)
					&& dog.distanceTo(client.player) < 3.5) {
				client.player.lookAt(EntityAnchorArgument.Anchor.EYES, dog.getBoundingBox().getCenter());
				break;
			}
		}
		return false;
	}

	private static void connectOwner(ClientGameTestContext context) {
		context.runOnClient(client -> ConnectScreen.startConnecting(new TitleScreen(), client,
				ServerAddress.parseString(SERVER_ADDRESS),
				new ServerData("Mushroom Daycare", SERVER_ADDRESS, ServerData.Type.OTHER), false, null));
	}

	private static void verifyOwnerRejoin(ClientGameTestContext context, TestDedicatedServerContext server,
			UUID ownerId, UUID walkerId, MushroomYorkieEntity dog) {
		server.runCommand("save-all flush");
		var oldConnection = server.computeOnServer(mc -> {
			var connection = Objects.requireNonNull(mc.getPlayerList().getPlayer(ownerId)).connection;
			connection.disconnect(Component.literal("Daycare rejoin check"));
			return connection;
		});
		for (int tick = 0; tick < 200; tick++) {
			boolean restored = server.computeOnServer(mc -> {
				var owner = mc.getPlayerList().getPlayer(ownerId);
				if (owner == null || owner.connection == oldConnection || !owner.isShiftKeyDown()) return false;
				var walker = Objects.requireNonNull(mc.getPlayerList().getPlayer(walkerId));
				assertBorrowedDog(dog, owner, walker);
				if (!dog.getItemBySlot(EquipmentSlot.BODY).is(ModItems.PADDED_VEST)) {
					throw new AssertionError("Owner reconnect lost Mushroom's vest");
				}
				return true;
			});
			if (restored) {
				System.out.printf("Daycare owner rejoin passed: dog=%s owner=%s walker=%s%n", dog.getUUID(), ownerId, walkerId);
				return;
			}
			context.waitTick();
		}
		throw new AssertionError("The native owner client did not reconnect after saving");
	}

	private static void soakWalks(ClientGameTestContext context, TestDedicatedServerContext server, UUID walkerId,
			UUID ownerId, MushroomYorkieEntity dog, double centerX, int seconds) {
		server.runCommand("gamerule minecraft:advance_time true");
		server.runCommand("time set 22300");
		long firstTick = server.computeOnServer(mc -> mc.overworld().getGameTime());
		long worldSeed = server.computeOnServer(mc -> mc.overworld().getSeed());
		long start = System.nanoTime();
		int walks = 0;
		int treats = 0;
		int movingDogWalks = 0;
		long firstDay = server.computeOnServer(mc -> mc.overworld().getDayTime() / 24000);
		System.out.printf("Daycare soak start: seconds=%d seed=%d tick=%d dog=%s owner=%s walker=%s%n",
				seconds, worldSeed, firstTick, dog.getUUID(), ownerId, walkerId);
		while (System.nanoTime() - start < Duration.ofSeconds(seconds).toNanos()) {
			var from = server.computeOnServer(mc -> mc.getPlayerList().getPlayer(walkerId).position());
			var dogFrom = server.computeOnServer(mc -> dog.position());
			context.runOnClient(client -> {
				client.player.setYRot(0);
				client.player.setXRot(0);
			});
			Function<Options, KeyMapping> move = from.x() <= centerX ? options -> options.keyLeft : options -> options.keyRight;
			holdMovement(context, move, 30);
			context.waitTicks(10);
			var health = server.computeOnServer(mc -> {
				var walker = Objects.requireNonNull(mc.getPlayerList().getPlayer(walkerId));
				var owner = Objects.requireNonNull(mc.getPlayerList().getPlayer(ownerId));
				assertBorrowedDog(dog, owner, walker);
				if (walker.position().distanceTo(from) < 3) {
					throw new AssertionError("A native daycare walk did not cover three blocks");
				}
				return dog.getHealth();
			});
			int hunger = server.computeOnServer(mc -> dog.needs.hunger());
			if (hunger >= 40) {
				feedBorrowedDog(context, server, walkerId, dog, hunger);
				treats++;
			}
			long currentDay = server.computeOnServer(mc -> mc.overworld().getDayTime() / 24000);
			double dogMovement = server.computeOnServer(mc -> dog.position().distanceTo(dogFrom));
			if (dogMovement > 0.25) movingDogWalks++;
			long tick = server.computeOnServer(mc -> mc.overworld().getGameTime());
			long timeOfDay = server.computeOnServer(mc -> mc.overworld().getDayTime() % 24000);
			System.out.printf("Daycare soak walk: %d tick=%d time=%d dawns=%d treats=%d dogHealth=%.1f dogMovement=%.2f%n",
					++walks, tick, timeOfDay, currentDay - firstDay, treats, health, dogMovement);
			context.waitTicks(280);
		}
		server.runOnServer(mc -> assertBorrowedDog(dog, mc.getPlayerList().getPlayer(ownerId),
				mc.getPlayerList().getPlayer(walkerId)));
		long elapsedTicks = server.computeOnServer(mc -> mc.overworld().getGameTime()) - firstTick;
		long dawns = server.computeOnServer(mc -> mc.overworld().getDayTime() / 24000) - firstDay;
		if (seconds >= 1800 && (dawns == 0 || treats == 0 || movingDogWalks == 0)) {
			throw new AssertionError("Extended daycare missed a dawn, a treat, or a walking dog");
		}
		System.out.printf("Daycare soak passed: seconds=%.3f ticks=%d walks=%d movingDogWalks=%d dawns=%d treats=%d%n",
				(System.nanoTime() - start) / 1e9, elapsedTicks, walks, movingDogWalks, dawns, treats);
	}

	private static void assertBorrowedDog(MushroomYorkieEntity dog, ServerPlayer owner, ServerPlayer walker) {
		if (owner == null || walker == null || !dog.isAlive() || !dog.isOwnedBy(owner)
				|| !dog.hasHarness() || dog.getLeashHolder() != walker) {
			throw new AssertionError("The dog or players lost the expected health, ownership, harness or lead");
		}
	}

	private static void holdMovement(ClientGameTestContext context, Function<Options, KeyMapping> binding, int ticks) {
		var input = context.getInput();
		input.holdKey(binding);
		try {
			context.waitTicks(ticks);
		} finally {
			input.releaseKey(binding);
		}
	}

	private static void feedBorrowedDog(ClientGameTestContext context, TestDedicatedServerContext server,
			UUID walkerId, MushroomYorkieEntity dog, int hunger) {
		server.runOnServer(mc -> mc.getPlayerList().getPlayer(walkerId)
				.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(ModItems.YORKIE_TREAT)));
		context.waitFor(client -> client.player.getMainHandItem().is(ModItems.YORKIE_TREAT));
		for (int attempt = 0; attempt < 2; attempt++) {
			var center = server.computeOnServer(mc -> dog.getBoundingBox().getCenter());
			context.runOnClient(client -> client.player.lookAt(EntityAnchorArgument.Anchor.EYES, center));
			if (server.computeOnServer(mc -> dog.distanceTo(mc.getPlayerList().getPlayer(walkerId))) < 2.6) {
				break;
			}
			holdMovement(context, options -> options.keyUp, 9);
			context.waitTicks(4);
		}
		var center = server.computeOnServer(mc -> dog.getBoundingBox().getCenter());
		context.runOnClient(client -> client.player.lookAt(EntityAnchorArgument.Anchor.EYES, center));
		context.waitFor(client -> client.hitResult instanceof EntityHitResult hit && hit.getEntity().getUUID().equals(dog.getUUID()));
		context.getInput().pressKey(options -> options.keyUse);
		context.waitFor(client -> client.player.getMainHandItem().isEmpty());
		if (server.computeOnServer(mc -> dog.needs.hunger()) >= hunger) {
			throw new AssertionError("Native treat did not reduce the borrowed dog's hunger");
		}
	}
}
