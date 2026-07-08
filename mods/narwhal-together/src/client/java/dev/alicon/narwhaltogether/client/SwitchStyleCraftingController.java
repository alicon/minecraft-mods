package dev.alicon.narwhaltogether.client;

import dev.alicon.narwhaltogether.client.mixin.AbstractContainerScreenAccessor;
import java.util.function.Function;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.inventory.AbstractContainerScreen;
import net.minecraft.client.gui.screens.inventory.CreativeModeInventoryScreen;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.inventory.ClickType;
import net.minecraft.world.inventory.Slot;

final class SwitchStyleCraftingController {
	private static final ControlifyInventoryInputs CONTROLIFY_INPUTS = new ControlifyInventoryInputs();
	private static final SwitchStyleCreativeInventoryHandler CREATIVE_HANDLER = new SwitchStyleCreativeInventoryHandler();
	private static int pendingCraftOneTicks;
	private static int pendingCraftMaxTicks;
	private static int pendingPlaceCarriedTicks;

	private SwitchStyleCraftingController() {
	}

	static void tick(Minecraft client, Function<AbstractContainerMenu, Slot> resultSlots) {
		if (client.player == null || client.gameMode == null || !(client.screen instanceof AbstractContainerScreen<?> screen)) {
			clearPending();
			return;
		}

		ControlifyInventoryPresses presses = CONTROLIFY_INPUTS.poll();
		AbstractContainerMenu menu = screen.getMenu();
		Slot hoveredSlot = ((AbstractContainerScreenAccessor) screen).narwhalTogether$hoveredSlot();
		if (screen instanceof CreativeModeInventoryScreen) {
			clearCraftingPending();
			CREATIVE_HANDLER.handle(client, menu, hoveredSlot, presses);
			return;
		}

		handleCraftingScreen(client, menu, hoveredSlot, presses, resultSlots.apply(menu));
	}

	private static void handleCraftingScreen(
			Minecraft client,
			AbstractContainerMenu menu,
			Slot hoveredSlot,
			ControlifyInventoryPresses presses,
			Slot resultSlot
	) {
		CREATIVE_HANDLER.clear();
		if (resultSlot == null) {
			clearCraftingPending();
			return;
		}

		if (presses.select()) {
			if (hoveredSlot != resultSlot && menu.getCarried().isEmpty()) {
				pendingCraftOneTicks = 3;
			} else {
				pendingPlaceCarriedTicks = 3;
			}
		}
		if (presses.quickMove() && hoveredSlot != resultSlot) {
			pendingCraftMaxTicks = 3;
		}

		if (pendingCraftMaxTicks > 0) {
			pendingCraftMaxTicks--;
			if (resultSlot.hasItem()) {
				client.gameMode.handleInventoryMouseClick(
						menu.containerId,
						resultSlot.index,
						0,
						ClickType.QUICK_MOVE,
						client.player
				);
				pendingCraftMaxTicks = 0;
			}
		}

		if (pendingCraftOneTicks > 0) {
			pendingCraftOneTicks--;
			if (resultSlot.hasItem()) {
				client.gameMode.handleInventoryMouseClick(
						menu.containerId,
						resultSlot.index,
						0,
						ClickType.PICKUP,
						client.player
				);
				pendingCraftOneTicks = 0;
				pendingPlaceCarriedTicks = 3;
			}
		}

		if (pendingPlaceCarriedTicks > 0) {
			pendingPlaceCarriedTicks--;
			if (SwitchStyleCarriedStackPlacer.place(client, menu)) {
				pendingPlaceCarriedTicks = 0;
			}
		}
	}

	private static void clearPending() {
		CREATIVE_HANDLER.clear();
		clearCraftingPending();
	}

	private static void clearCraftingPending() {
		pendingCraftOneTicks = 0;
		pendingCraftMaxTicks = 0;
		pendingPlaceCarriedTicks = 0;
	}
}
