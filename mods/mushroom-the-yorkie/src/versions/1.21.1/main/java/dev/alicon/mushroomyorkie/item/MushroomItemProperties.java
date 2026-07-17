package dev.alicon.mushroomyorkie.item;

import net.minecraft.resources.ResourceKey;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.item.Item;

final class MushroomItemProperties {
	private MushroomItemProperties() {
	}

	static Item.Properties withId(Item.Properties properties, ResourceKey<Item> key) {
		return properties;
	}

	static <T extends Entity> Item.Properties spawnEgg(Item.Properties properties, EntityType<T> entityType) {
		return properties;
	}
}
