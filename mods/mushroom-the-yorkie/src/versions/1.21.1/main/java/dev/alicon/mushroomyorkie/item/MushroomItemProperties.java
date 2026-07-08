package dev.alicon.mushroomyorkie.item;

import dev.alicon.mushroomyorkie.entity.MushroomYorkieEntity;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.item.Item;

final class MushroomItemProperties {
	private MushroomItemProperties() {
	}

	static Item.Properties withId(Item.Properties properties, ResourceKey<Item> key) {
		return properties;
	}

	static Item.Properties spawnEgg(Item.Properties properties, EntityType<MushroomYorkieEntity> entityType) {
		return properties;
	}
}
