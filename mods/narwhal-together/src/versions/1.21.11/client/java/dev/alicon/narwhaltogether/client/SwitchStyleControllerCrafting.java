package dev.alicon.narwhaltogether.client;

import net.minecraft.client.Minecraft;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.inventory.CraftingMenu;
import net.minecraft.world.inventory.InventoryMenu;
import net.minecraft.world.inventory.ResultSlot;
import net.minecraft.world.inventory.Slot;

final class SwitchStyleControllerCrafting {
	private SwitchStyleControllerCrafting() {
	}

	static void tick(Minecraft client) {
		SwitchStyleCraftingController.tick(client, SwitchStyleControllerCrafting::resultSlot);
	}

	private static Slot resultSlot(AbstractContainerMenu menu) {
		if (menu instanceof CraftingMenu craftingMenu) {
			return craftingMenu.getResultSlot();
		}
		if (menu instanceof InventoryMenu inventoryMenu) {
			return inventoryMenu.getResultSlot();
		}

		for (Slot slot : menu.slots) {
			if (slot instanceof ResultSlot) {
				return slot;
			}
		}
		return null;
	}
}
