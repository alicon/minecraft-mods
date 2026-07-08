package dev.alicon.narwhaltogether.client;

import net.minecraft.client.Minecraft;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.inventory.ClickType;
import net.minecraft.world.inventory.Slot;
import net.minecraft.world.item.ItemStack;

final class SwitchStyleCarriedStackPlacer {
	private SwitchStyleCarriedStackPlacer() {
	}

	static boolean place(Minecraft client, AbstractContainerMenu menu) {
		if (client.player == null || client.gameMode == null) {
			return false;
		}

		ItemStack carried = menu.getCarried();
		if (carried.isEmpty()) {
			return true;
		}

		Slot destination = carriedMergeSlot(client, menu, carried);
		if (destination == null) {
			destination = emptyInventorySlot(client, menu, carried);
		}
		if (destination == null) {
			return false;
		}

		client.gameMode.handleInventoryMouseClick(
				menu.containerId,
				destination.index,
				0,
				ClickType.PICKUP,
				client.player
		);
		return true;
	}

	private static Slot carriedMergeSlot(Minecraft client, AbstractContainerMenu menu, ItemStack carried) {
		for (Slot slot : menu.slots) {
			if (isPlayerInventoryDestination(client, slot, carried)
					&& slot.hasItem()
					&& ItemStack.isSameItemSameComponents(slot.getItem(), carried)
					&& slot.getItem().getCount() < slot.getItem().getMaxStackSize()) {
				return slot;
			}
		}
		return null;
	}

	private static Slot emptyInventorySlot(Minecraft client, AbstractContainerMenu menu, ItemStack carried) {
		for (Slot slot : menu.slots) {
			if (isPlayerInventoryDestination(client, slot, carried) && !slot.hasItem()) {
				return slot;
			}
		}
		return null;
	}

	private static boolean isPlayerInventoryDestination(Minecraft client, Slot slot, ItemStack stack) {
		return slot.container == client.player.getInventory()
				&& slot.mayPlace(stack)
				&& !slot.isFake();
	}
}
