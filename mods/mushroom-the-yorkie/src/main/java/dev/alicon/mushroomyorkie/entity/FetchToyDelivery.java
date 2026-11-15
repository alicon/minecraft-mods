package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.item.YorkieFetchToyStacks;
import java.util.UUID;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.item.ItemStack;

final class FetchToyDelivery {
	private FetchToyDelivery() {
	}

	static Delivery returnToy(ServerLevel level, MushroomYorkieEntity yorkie, Player owner, ItemStack returnedStack) {
		if (returnedStack.isEmpty() || YorkieFetchToyStacks.isFreeCreativeCopy(returnedStack)) {
			return new Delivery(null, ItemStack.EMPTY);
		}

		// Creative inventory may report success while discarding overflow. Observe the
		// actual component-matching inventory increase, not its success flag or emptied input.
		int before = matchingCount(owner, returnedStack);
		owner.addItem(returnedStack.copy());
		int inserted = matchingCount(owner, returnedStack) - before;
		ItemStack remainder = returnedStack.copyWithCount(Math.max(0, returnedStack.getCount() - inserted));
		if (remainder.isEmpty()) {
			return new Delivery(null, ItemStack.EMPTY);
		}

		if (owner.isCreative()) {
			return new Delivery(null, remainder);
		}

		ItemEntity returned = new ItemEntity(level, owner.getX(), owner.getY() + 0.2D, owner.getZ(), remainder);
		returned.setPickUpDelay(20);
		returned.setThrower(yorkie);
		level.addFreshEntity(returned);
		return new Delivery(returned.getUUID(), ItemStack.EMPTY);
	}

	static boolean shouldWaitForCreativeSpace(Player owner, ItemStack stack) {
		if (!owner.isCreative()) {
			return false;
		}
		int capacity = 0;
		for (int slot = 0; slot < Inventory.INVENTORY_SIZE; slot++) {
			capacity += capacityFor(owner.getInventory().getItem(slot), stack, owner.getInventory().getMaxStackSize());
		}
		// Vanilla can merge into an existing offhand stack, but does not fill an empty offhand slot.
		if (!owner.getOffhandItem().isEmpty()) {
			capacity += capacityFor(owner.getOffhandItem(), stack, owner.getInventory().getMaxStackSize());
		}
		return capacity < stack.getCount();
	}

	private static int capacityFor(ItemStack candidate, ItemStack stack, int inventoryLimit) {
		int limit = Math.min(stack.getMaxStackSize(), inventoryLimit);
		return candidate.isEmpty() ? limit : ItemStack.isSameItemSameComponents(stack, candidate) ? Math.max(0, limit - candidate.getCount()) : 0;
	}

	private static int matchingCount(Player owner, ItemStack stack) {
		int count = 0;
		for (int slot = 0; slot < owner.getInventory().getContainerSize(); slot++) {
			ItemStack candidate = owner.getInventory().getItem(slot);
			if (ItemStack.isSameItemSameComponents(stack, candidate)) {
				count += candidate.getCount();
			}
		}
		return count;
	}

	record Delivery(UUID droppedToy, ItemStack carriedRemainder) {
	}
}
