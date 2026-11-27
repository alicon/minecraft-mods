package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.item.ModItems;
import java.util.UUID;
import java.util.function.Predicate;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerContext;
import net.minecraft.client.gui.screens.inventory.BookViewScreen;
import net.minecraft.commands.arguments.EntityAnchorArgument;
import net.minecraft.core.BlockPos;
import net.minecraft.server.MinecraftServer;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;
import org.lwjgl.glfw.GLFW;

final class ExpeditionGuideClientScenario {
	private static final BlockPos SQUIRREL_POS = new BlockPos(21, 90, 15);

	private ExpeditionGuideClientScenario() {
	}

	static void practice(ClientGameTestContext context, TestServerContext server, UUID ownerId, UUID dogId) {
		server.runCommand("fill 11 89 11 25 89 22 minecraft:stone");
		server.runCommand("fill 11 90 14 25 93 16 minecraft:air");
		server.runCommand("tp @a 13.5 90 15.5 -90 0");
		server.runOnServer(minecraft -> {
			var player = minecraft.getPlayerList().getPlayer(ownerId);
			var inventory = player.getInventory();
			int bookSlot = inventory.findSlotMatchingItem(new ItemStack(ModItems.FIELD_GUIDE));
			if (bookSlot < 0) {
				throw new AssertionError("Adopting after sleep did not give the owner a Field Guide");
			}
			var guide = inventory.getItem(bookSlot);
			inventory.setItem(bookSlot, ItemStack.EMPTY);
			inventory.setItem(4, new ItemStack(ModItems.YORKIE_TREAT, 2));
			inventory.setItem(8, guide);
			var dog = dog(minecraft, dogId);
			dog.setPos(16.5, 90, 15.5);
			dog.getNavigation().stop();
		});
		context.waitFor(client -> client.player.blockPosition().equals(new BlockPos(13, 90, 15)));
		lookAway(context);
		selectGuide(context);
		readGuide(context, "expedition-guide-first-lesson");

		var squirrelId = server.computeOnServer(minecraft -> {
			var level = minecraft.overworld();
			var squirrel = ModEntities.SQUIRREL.create(level, EntitySpawnReason.COMMAND);
			if (squirrel == null) throw new AssertionError("Could not stage a squirrel");
			squirrel.setPos(Vec3.atBottomCenterOf(SQUIRREL_POS));
			squirrel.setNoAi(true);
			level.addFreshEntity(squirrel);
			return squirrel.getUUID();
		});
		awaitServer(context, server, minecraft -> {
			var navigation = dog(minecraft, dogId).getNavigation();
			return SQUIRREL_POS.equals(navigation.getTargetPos()) && !navigation.isDone();
		}, "Mushroom did not start chasing the squirrel");

		var input = context.getInput();
		input.holdKey(options -> options.keyShift);
		try {
			awaitServer(context, server, minecraft -> minecraft.getPlayerList().getPlayer(ownerId).isShiftKeyDown(),
					"The server did not see the native crouch input");
			input.pressKey(options -> options.keyUse);
			awaitServer(context, server, minecraft -> dog(minecraft, dogId).leaveItTraining.suppressesBarking(),
					"The crouch-use cue did not interrupt the active chase");
		} finally {
			input.releaseKey(options -> options.keyShift);
		}
		awaitServer(context, server, minecraft -> dog(minecraft, dogId).leaveItTraining.waitingForTreat(), "Mushroom did not come back to the handler");
		input.pressKey(options -> options.keyHotbarSlots[4]);
		context.waitFor(client -> client.player.getMainHandItem().is(ModItems.YORKIE_TREAT));
		aimAtDog(context, dogId);
		input.pressKey(options -> options.keyUse);
		awaitServer(context, server, minecraft -> dog(minecraft, dogId).leaveItTraining.paws().size() == 1,
				"Feeding the returned dog did not award one paw");
		server.runOnServer(minecraft -> {
			var paw = dog(minecraft, dogId).leaveItTraining.paws().getFirst();
			if (!paw.squirrel().equals(squirrelId)) throw new AssertionError("A different squirrel earned the paw");
			minecraft.overworld().getEntity(squirrelId).discard();
		});
		selectGuide(context);
		lookAway(context);
		readGuide(context, "expedition-guide-one-paw-next-lesson");
		System.out.println("Expedition guide passed: adoption book, crouch-use recall, treat, and one saved paw for dog=" + dogId);
		selectFirstSlot(context, server, ownerId);
	}

	static void checkReopened(ClientGameTestContext context, TestServerContext server, UUID ownerId, UUID dogId) {
		server.runOnServer(minecraft -> {
			var dog = dog(minecraft, dogId);
			if (dog.leaveItTraining.paws().size() != 1 || dog.leaveItTraining.suppressesBarking()) {
				throw new AssertionError("Leave it progress or transient cue state was wrong after portal travel and reopen");
			}
			var player = minecraft.getPlayerList().getPlayer(ownerId);
			if (dog.distanceToSqr(player) > 16 * 16) {
				throw new AssertionError("The original dog is too far from the handler to read his lesson");
			}
			// The staged End death drops the original book. A replacement reads the dog's saved progress.
			player.getInventory().setItem(8, new ItemStack(ModItems.FIELD_GUIDE));
		});
		selectGuide(context);
		lookAway(context);
		readGuide(context, "expedition-guide-one-paw-after-reopen");
		selectFirstSlot(context, server, ownerId);
	}

	private static void selectFirstSlot(ClientGameTestContext context, TestServerContext server, UUID ownerId) {
		context.getInput().pressKey(options -> options.keyHotbarSlots[0]);
		awaitServer(context, server, minecraft -> minecraft.getPlayerList().getPlayer(ownerId).getInventory().getSelectedSlot() == 0,
				"The server was still using the guide's hotbar slot");
	}

	private static void aimAtDog(ClientGameTestContext context, UUID dogId) {
		for (int tick = 0; tick < 20; tick++) {
			boolean aimed = context.computeOnClient(client -> {
				if (client.hitResult instanceof EntityHitResult hit && hit.getEntity().getUUID().equals(dogId)) {
					return true;
				}
				client.level.entitiesForRendering().forEach(entity -> {
					if (entity.getUUID().equals(dogId)) {
						client.player.lookAt(EntityAnchorArgument.Anchor.EYES, entity.getBoundingBox().getCenter());
					}
				});
				return false;
			});
			if (aimed) return;
			context.waitTick();
		}
		throw new AssertionError("The returned dog was never in normal interaction reach");
	}

	private static void lookAway(ClientGameTestContext context) {
		context.runOnClient(client -> client.player.setXRot(-78));
		context.waitFor(client -> client.hitResult != null && client.hitResult.getType() == HitResult.Type.MISS);
	}

	private static void selectGuide(ClientGameTestContext context) {
		context.getInput().pressKey(options -> options.keyHotbarSlots[8]);
		context.waitFor(client -> client.player.getMainHandItem().is(ModItems.FIELD_GUIDE));
	}

	private static void readGuide(ClientGameTestContext context, String screenshot) {
		context.getInput().pressKey(options -> options.keyUse);
		context.waitFor(client -> client.screen instanceof BookViewScreen);
		context.takeScreenshot(screenshot);
		context.getInput().pressKey(GLFW.GLFW_KEY_ESCAPE);
		context.waitFor(client -> client.screen == null);
		context.waitTicks(4);
	}

	private static void awaitServer(ClientGameTestContext context, TestServerContext server,
			Predicate<MinecraftServer> condition, String failure) {
		for (int tick = 0; tick < 80; tick++) {
			if (server.computeOnServer(condition::test)) return;
			context.waitTick();
		}
		throw new AssertionError(failure);
	}

	private static MushroomYorkieEntity dog(MinecraftServer server, UUID dogId) {
		var dog = (MushroomYorkieEntity) server.overworld().getEntity(dogId);
		if (dog == null) throw new AssertionError("Could not find the adopted dog " + dogId);
		return dog;
	}
}
