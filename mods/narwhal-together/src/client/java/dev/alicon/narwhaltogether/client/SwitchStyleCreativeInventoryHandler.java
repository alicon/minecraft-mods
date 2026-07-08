package dev.alicon.narwhaltogether.client;

import net.minecraft.client.Minecraft;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.inventory.Slot;
import net.minecraft.world.item.ItemStack;

final class SwitchStyleCreativeInventoryHandler {
	private PendingCreativeAdd pendingAdd;

	void handle(Minecraft client, AbstractContainerMenu menu, Slot hoveredSlot, ControlifyInventoryPresses presses) {
		if (client.player == null || client.gameMode == null) {
			this.clear();
			return;
		}

		if (isCreativePaletteSlot(client, hoveredSlot) && (presses.select() || presses.quickMove())) {
			ItemStack stack = hoveredSlot.getItem().copy();
			stack.setCount(presses.quickMove() ? stack.getMaxStackSize() : 1);
			this.pendingAdd = new PendingCreativeAdd(stack, 2);
			return;
		}

		if (this.pendingAdd == null) {
			return;
		}

		this.pendingAdd = this.pendingAdd.nextTick();
		if (this.pendingAdd.ticksRemaining() > 0) {
			return;
		}

		ItemStack stack = this.pendingAdd.stack();
		this.pendingAdd = null;
		int freeSlot = client.player.getInventory().getFreeSlot();
		if (freeSlot < 0) {
			menu.setCarried(stack.copy());
			return;
		}

		ItemStack stackToAdd = stack.copy();
		client.player.getInventory().setItem(freeSlot, stackToAdd.copy());
		client.player.inventoryMenu.broadcastChanges();
		client.gameMode.handleCreativeModeItemAdd(stackToAdd, creativeProtocolSlot(freeSlot));
		menu.setCarried(ItemStack.EMPTY);
	}

	void clear() {
		this.pendingAdd = null;
	}

	private static boolean isCreativePaletteSlot(Minecraft client, Slot slot) {
		return slot != null
				&& slot.hasItem()
				&& !slot.isFake()
				&& client.player != null
				&& slot.container != client.player.getInventory();
	}

	private static int creativeProtocolSlot(int inventorySlot) {
		if (inventorySlot >= 0 && inventorySlot < Inventory.getSelectionSize()) {
			return 36 + inventorySlot;
		}
		return inventorySlot;
	}

	private record PendingCreativeAdd(ItemStack stack, int ticksRemaining) {
		private PendingCreativeAdd nextTick() {
			return new PendingCreativeAdd(stack, ticksRemaining - 1);
		}
	}
}
