package dev.alicon.mushroomyorkie.item;

import dev.alicon.mushroomyorkie.MushroomTheYorkie;
import dev.alicon.mushroomyorkie.entity.ModEntities;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.item.Item;

/** Registry holder for Mushroom the Yorkie items. */
public final class ModItems {
	/** Treat used to tame, feed, and trigger small trick effects for Mushroom. */
	public static final Item YORKIE_TREAT = register("yorkie_treat", new Item(new Item.Properties()
			.stacksTo(64)
			.setId(key("yorkie_treat"))));
	/** Small black harness that lets Mushroom safely wear a lead. */
	public static final Item YORKIE_HARNESS = register("yorkie_harness", new Item(new Item.Properties()
			.stacksTo(1)
			.setId(key("yorkie_harness"))));
	/** Spawn egg for creating the Mushroom Yorkie entity. */
	public static final Item MUSHROOM_YORKIE_SPAWN_EGG = register(
				"mushroom_yorkie_spawn_egg",
				new MushroomYorkieSpawnEggItem(new Item.Properties()
						.spawnEgg(ModEntities.MUSHROOM_YORKIE)
					.stacksTo(64)
					.setId(key("mushroom_yorkie_spawn_egg")))
	);

	private ModItems() {
	}

	/** Loads this class so static item registrations run during mod initialization. */
	public static void initialize() {
	}

	private static Item register(String name, Item item) {
		return Registry.register(BuiltInRegistries.ITEM, key(name), item);
	}

	private static ResourceKey<Item> key(String name) {
		return ResourceKey.create(Registries.ITEM, MushroomTheYorkie.id(name));
	}
}
