package dev.alicon.mushroomyorkie.entity;

import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.entity.EntityTypeTest;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

final class FetchToyChase {
	private static final double SEARCH_RADIUS = 32.0D;
	private static final double PICKUP_HORIZONTAL_DISTANCE_SQR = 3.24D;
	private static final double PICKUP_VERTICAL_DISTANCE = 2.0D;

	private FetchToyChase() {
	}

	static ItemEntity findNearestFetchToy(
			ServerLevel level,
			MushroomYorkieEntity yorkie,
			Player owner,
			UUID lastReturnedToy,
			UUID ignoredToy
	) {
		AABB area = yorkie.getBoundingBox().inflate(SEARCH_RADIUS, 8.0D, SEARCH_RADIUS);
		List<ItemEntity> toys = level.getEntities(
				EntityTypeTest.forClass(ItemEntity.class),
				area,
				item -> MushroomFetchToyPolicy.isFetchToy(item.getItem())
						&& !item.getUUID().equals(lastReturnedToy)
						&& !item.getUUID().equals(ignoredToy)
		);
		return toys.stream()
				.filter(item -> FetchToySafety.safeFetchPlacement(level, owner, yorkie, item))
				.min(Comparator.comparingDouble(yorkie::distanceToSqr))
				.orElseGet(() -> toys.stream().min(Comparator.comparingDouble(yorkie::distanceToSqr)).orElse(null));
	}

	static boolean canPickUp(MushroomYorkieEntity yorkie, ItemEntity item) {
		Vec3 delta = item.position().subtract(yorkie.position());
		return delta.horizontalDistanceSqr() <= PICKUP_HORIZONTAL_DISTANCE_SQR && Math.abs(delta.y) <= PICKUP_VERTICAL_DISTANCE;
	}

	static Vec3 moveTarget(MushroomYorkieEntity yorkie, ItemEntity item) {
		if (MushroomYorkieStateQueries.ownerIsCreativeFlying(yorkie)) {
			return item.position();
		}

		double y = item.getY();
		if (Math.abs(y - yorkie.getY()) > PICKUP_VERTICAL_DISTANCE) {
			y = yorkie.getY();
		}
		return new Vec3(item.getX(), y, item.getZ());
	}

	static ItemStack pickUp(ItemEntity toy) {
		ItemStack stack = toy.getItem();
		ItemStack carriedToy = stack.copyWithCount(1);
		stack.shrink(1);
		if (stack.isEmpty()) {
			toy.discard();
		} else {
			toy.setItem(stack);
		}
		return carriedToy;
	}
}
