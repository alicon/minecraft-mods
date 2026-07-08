package dev.alicon.copsrobbers.client;

import dev.alicon.copsrobbers.CopsAndRobbers;
import dev.alicon.copsrobbers.ToggleCruiserFlightPayload;
import dev.alicon.copsrobbers.ToggleCruiserLightsPayload;
import dev.alicon.copsrobbers.ToggleCruiserSirenPayload;
import dev.alicon.copsrobbers.TriggerCruiserBarrelRollPayload;
import dev.alicon.copsrobbers.TriggerCruiserLoopPayload;
import dev.alicon.copsrobbers.UpdateCruiserFlightInputPayload;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import org.lwjgl.glfw.GLFW;

final class CruiserKeyboardControls {
	private static final int FLIGHT_DOUBLE_TAP_TICKS = 7;
	private static final KeyMapping.Category CONTROLS_CATEGORY =
			KeyMapping.Category.register(CopsAndRobbers.id("controls"));
	private static final KeyMapping TOGGLE_LIGHTS = KeyBindingHelper.registerKeyBinding(new KeyMapping(
			"key.cops_robbers.toggle_lights",
			GLFW.GLFW_KEY_Z,
			CONTROLS_CATEGORY
	));
	private static final KeyMapping TOGGLE_SIREN = KeyBindingHelper.registerKeyBinding(new KeyMapping(
			"key.cops_robbers.toggle_siren",
			GLFW.GLFW_KEY_X,
			CONTROLS_CATEGORY
	));
	private static final KeyMapping BARREL_ROLL = KeyBindingHelper.registerKeyBinding(new KeyMapping(
			"key.cops_robbers.barrel_roll",
			GLFW.GLFW_KEY_C,
			CONTROLS_CATEGORY
	));
	private static final KeyMapping LOOP = KeyBindingHelper.registerKeyBinding(new KeyMapping(
			"key.cops_robbers.loop",
			GLFW.GLFW_KEY_V,
			CONTROLS_CATEGORY
	));
	private static int lastJumpTapTick = -FLIGHT_DOUBLE_TAP_TICKS;
	private static boolean lastJumpPressed;

	private CruiserKeyboardControls() {
	}

	static void register() {
		ClientTickEvents.END_CLIENT_TICK.register(client -> {
			sendDedicatedShortcuts(client);
			sendVanillaDrivingShortcuts(client);
			tickCreativeFlightToggle(client);
			sendCreativeFlightInput(client);
			CopsAndRobbersControllerShortcuts.tick(client);
		});
	}

	private static void sendDedicatedShortcuts(Minecraft client) {
		while (TOGGLE_LIGHTS.consumeClick()) {
			if (CopsAndRobbersClient.isDrivingCruiser(client) && ClientPlayNetworking.canSend(ToggleCruiserLightsPayload.TYPE)) {
				ClientPlayNetworking.send(ToggleCruiserLightsPayload.INSTANCE);
			}
		}
		while (TOGGLE_SIREN.consumeClick()) {
			if (CopsAndRobbersClient.isDrivingCruiser(client) && ClientPlayNetworking.canSend(ToggleCruiserSirenPayload.TYPE)) {
				ClientPlayNetworking.send(ToggleCruiserSirenPayload.INSTANCE);
			}
		}
		while (BARREL_ROLL.consumeClick()) {
			if (CopsAndRobbersClient.isDrivingCruiser(client) && ClientPlayNetworking.canSend(TriggerCruiserBarrelRollPayload.TYPE)) {
				ClientPlayNetworking.send(TriggerCruiserBarrelRollPayload.INSTANCE);
			}
		}
		while (LOOP.consumeClick()) {
			if (CopsAndRobbersClient.isDrivingCruiser(client) && ClientPlayNetworking.canSend(TriggerCruiserLoopPayload.TYPE)) {
				ClientPlayNetworking.send(TriggerCruiserLoopPayload.INSTANCE);
			}
		}
	}

	private static void sendVanillaDrivingShortcuts(Minecraft client) {
		if (!CopsAndRobbersClient.isDrivingCruiser(client)) {
			return;
		}
		while (client.options.keyInventory.consumeClick()) {
			if (ClientPlayNetworking.canSend(ToggleCruiserLightsPayload.TYPE)) {
				ClientPlayNetworking.send(ToggleCruiserLightsPayload.INSTANCE);
			}
		}
		while (client.options.keyDrop.consumeClick()) {
			if (ClientPlayNetworking.canSend(ToggleCruiserSirenPayload.TYPE)) {
				ClientPlayNetworking.send(ToggleCruiserSirenPayload.INSTANCE);
			}
		}
	}

	private static void tickCreativeFlightToggle(Minecraft client) {
		if (!CopsAndRobbersClient.isDrivingCruiser(client) || client.player == null || !client.player.isCreative()) {
			lastJumpPressed = false;
			lastJumpTapTick = -FLIGHT_DOUBLE_TAP_TICKS;
			return;
		}

		boolean jumpPressed = client.options.keyJump.isDown();
		if (jumpPressed && !lastJumpPressed) {
			if (client.player.tickCount - lastJumpTapTick <= FLIGHT_DOUBLE_TAP_TICKS) {
				if (ClientPlayNetworking.canSend(ToggleCruiserFlightPayload.TYPE)) {
					ClientPlayNetworking.send(ToggleCruiserFlightPayload.INSTANCE);
				}
				lastJumpTapTick = -FLIGHT_DOUBLE_TAP_TICKS;
			} else {
				lastJumpTapTick = client.player.tickCount;
			}
		}
		lastJumpPressed = jumpPressed;
	}

	private static void sendCreativeFlightInput(Minecraft client) {
		if (!CopsAndRobbersClient.isDrivingCruiser(client) || client.player == null || !client.player.isCreative()
				|| !ClientPlayNetworking.canSend(UpdateCruiserFlightInputPayload.TYPE)) {
			return;
		}

		float lift = 0.0F;
		if (client.options.keyJump.isDown()) {
			lift += 1.0F;
		}
		if (client.options.keyShift.isDown()) {
			lift -= 1.0F;
		}
		ClientPlayNetworking.send(new UpdateCruiserFlightInputPayload(lift));
	}
}
