package dev.alicon.mushroomyorkie.entity;

import java.util.ArrayDeque;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.animal.Animal;
import net.minecraft.world.phys.AABB;

final class MushroomPeacefulMobMemory {
	private static final int MAX_REMEMBERED = 64;
	private static final double REMEMBER_RADIUS = 12.0D;

	private final Set<UUID> remembered = new HashSet<>();
	private final ArrayDeque<UUID> order = new ArrayDeque<>();

	boolean remembers(Animal animal) {
		return this.remembered.contains(animal.getUUID());
	}

	void remember(Animal animal) {
		this.remember(animal.getUUID());
	}

	void rememberNearby(ServerLevel level, MushroomYorkieEntity yorkie) {
		AABB area = yorkie.getBoundingBox().inflate(REMEMBER_RADIUS, 4.0D, REMEMBER_RADIUS);
		for (Animal animal : level.getEntitiesOfClass(Animal.class, area, animal -> animal != yorkie && animal.isAlive())) {
			this.remember(animal.getUUID());
		}
	}

	String save() {
		StringBuilder saved = new StringBuilder();
		for (UUID uuid : this.order) {
			if (saved.length() > 0) {
				saved.append(';');
			}
			saved.append(uuid);
		}
		return saved.toString();
	}

	void read(String saved) {
		this.remembered.clear();
		this.order.clear();
		if (saved.isBlank()) {
			return;
		}

		for (String value : saved.split(";")) {
			try {
				this.remember(UUID.fromString(value));
			} catch (IllegalArgumentException ignored) {
				// Ignore corrupted old entries without breaking the whole save.
			}
		}
	}

	private void remember(UUID uuid) {
		if (!this.remembered.add(uuid)) {
			return;
		}

		this.order.addLast(uuid);
		while (this.order.size() > MAX_REMEMBERED) {
			UUID removed = this.order.removeFirst();
			this.remembered.remove(removed);
		}
	}
}
