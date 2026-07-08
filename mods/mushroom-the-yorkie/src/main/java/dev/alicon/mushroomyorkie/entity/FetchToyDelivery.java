package dev.alicon.mushroomyorkie.entity;

import java.util.UUID;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;

final class FetchToyDelivery {
	private FetchToyDelivery() {
	}

	static UUID returnToy(ServerLevel level, MushroomYorkieEntity yorkie, Player owner, ItemStack returnedStack) {
		if (returnedStack.isEmpty() || owner.isCreative()) {
			return null;
		}

		if (owner.addItem(returnedStack)) {
			return null;
		}

		ItemEntity returned = new ItemEntity(level, owner.getX(), owner.getY() + 0.2D, owner.getZ(), returnedStack);
		returned.setPickUpDelay(20);
		returned.setThrower(yorkie);
		level.addFreshEntity(returned);
		return returned.getUUID();
	}
}
