package dev.alicon.mushroomyorkie.entity;

import java.time.Duration;
import java.util.Objects;
import java.util.Properties;
import java.util.UUID;

import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestDedicatedServerContext;
import net.minecraft.commands.arguments.EntityAnchorArgument;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.phys.EntityHitResult;

public final class DaycareClientGameTest implements FabricClientGameTest {
	private static final String DOG_OWNER = "DaycareGuest";
	private static final int SERVER_PORT = 57341;

	@Override
	public void runTest(ClientGameTestContext context) {
		var settings = new Properties();
		settings.setProperty("server-ip", "127.0.0.1");
		settings.setProperty("server-port", Integer.toString(SERVER_PORT));
		settings.setProperty("max-players", "2");
		settings.setProperty("motd", "Mushroom Daycare Client GameTest");
		try (var server = context.worldBuilder().createServer(settings); var connection = server.connect()) {
			connection.getClientWorld().waitForChunksRender();
			var walkerId = context.computeOnClient(client -> client.player.getUUID());
			System.out.println("Daycare ready for DaycareGuest at 127.0.0.1:" + SERVER_PORT);
			long deadline = System.nanoTime() + Duration.ofSeconds(90).toNanos();
			while (!server.computeOnServer(mc -> mc.getPlayerList().getPlayerByName(DOG_OWNER) != null)) {
				if (System.nanoTime() >= deadline) {
					throw new IllegalStateException("DaycareGuest did not join the disposable server");
				}
				context.waitTick();
			}
			try {
				walkBorrowedDog(context, server, walkerId);
			} catch (AssertionError | RuntimeException failure) {
				context.takeScreenshot("daycare-client-failure");
				throw failure;
			}
		}
	}

	private static void walkBorrowedDog(ClientGameTestContext context, TestDedicatedServerContext server, UUID walkerId) {
		var ownerId = server.computeOnServer(mc -> mc.getPlayerList().getPlayerByName(DOG_OWNER).getUUID());
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
			walker.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.LEAD));
			return yorkie;
		});
		var dogId = dog.getUUID();
		var aim = server.computeOnServer(mc -> dog.getBoundingBox().getCenter());
		context.waitFor(client -> client.player.getMainHandItem().is(Items.LEAD));
		context.runOnClient(client -> client.player.lookAt(EntityAnchorArgument.Anchor.EYES, aim));
		context.waitFor(client -> client.hitResult instanceof EntityHitResult hit && hit.getEntity().getUUID().equals(dogId));
		context.getInput().pressKey(options -> options.keyUse);
		context.waitFor(client -> client.player.getMainHandItem().isEmpty());
		context.takeScreenshot("daycare-client-lead");
		var walkerStart = server.computeOnServer(mc -> mc.getPlayerList().getPlayer(walkerId).position());
		var dogStart = server.computeOnServer(mc -> {
			dog.setNoAi(false);
			return dog.position();
		});
		var input = context.getInput();
		input.holdKey(options -> options.keyLeft);
		try {
			context.waitTicks(30);
		} finally {
			input.releaseKey(options -> options.keyLeft);
		}
		context.waitTicks(10);
		server.runOnServer(mc -> {
			var walker = Objects.requireNonNull(mc.getPlayerList().getPlayer(walkerId));
			var owner = Objects.requireNonNull(mc.getPlayerList().getPlayer(ownerId));
			double walkerMovement = walker.position().distanceTo(walkerStart);
			double dogMovement = dog.position().distanceTo(dogStart);
			if (dog.getLeashHolder() != walker || !dog.hasHarness() || !dog.isOwnedBy(owner)) {
				throw new AssertionError("Borrowing the lead changed the owner, harness, or leash holder");
			}
			if (walkerMovement < 3 || dogMovement < 0.25) {
				throw new AssertionError("Borrowed walk fell short: walker=" + walkerMovement + " dog=" + dogMovement);
			}
			System.out.printf("Daycare walk passed: dog=%s owner=%s walker=%s walkerDistance=%.2f dogDistance=%.2f%n",
					dogId, ownerId, walkerId, walkerMovement, dogMovement);
		});
		context.takeScreenshot("daycare-client-walk");
	}
}
