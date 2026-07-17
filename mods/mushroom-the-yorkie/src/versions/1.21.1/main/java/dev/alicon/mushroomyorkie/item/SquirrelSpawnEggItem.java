package dev.alicon.mushroomyorkie.item;

import dev.alicon.mushroomyorkie.entity.ModEntities;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.SpawnEggItem;

final class SquirrelSpawnEggItem extends SpawnEggItem {
	SquirrelSpawnEggItem(Item.Properties properties) {
		super(ModEntities.SQUIRREL, 0xA84418, 0xF4D6A0, properties);
	}
}
