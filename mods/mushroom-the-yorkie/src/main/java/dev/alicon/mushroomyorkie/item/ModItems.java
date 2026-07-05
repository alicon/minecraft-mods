package dev.alicon.mushroomyorkie.item;

import dev.alicon.mushroomyorkie.MushroomTheYorkie;
import dev.alicon.mushroomyorkie.block.ModBlocks;
import dev.alicon.mushroomyorkie.entity.ModEntities;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.item.BlockItem;
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
	/** Copper dog bowl that can be placed in a Mushroom home. */
	public static final Item DOG_BOWL = register("dog_bowl", new BlockItem(ModBlocks.DOG_BOWL, new Item.Properties()
			.stacksTo(16)
			.setId(key("dog_bowl"))));
	/** Dog bowl filled with one serving of food for Mushroom. */
	public static final Item DOG_FOOD_BOWL = register("dog_food_bowl", new BlockItem(ModBlocks.DOG_FOOD_BOWL, new Item.Properties()
			.stacksTo(16)
			.setId(key("dog_food_bowl"))));
	/** Dog bowl filled with water for Mushroom. */
	public static final Item DOG_WATER_BOWL = register("dog_water_bowl", new BlockItem(ModBlocks.DOG_WATER_BOWL, new Item.Properties()
			.stacksTo(16)
			.setId(key("dog_water_bowl"))));
	/** Soft placeable bed that Mushroom can curl up on at night. */
	public static final Item DOG_BED = register("dog_bed", new BlockItem(ModBlocks.DOG_BED, new Item.Properties()
			.stacksTo(16)
			.setId(key("dog_bed"))));
	/** Wool toy ball Mushroom can fetch when dropped away from his owner. */
	public static final Item YORKIE_BALL = register("yorkie_ball", new YorkieBallItem(new Item.Properties()
			.stacksTo(16)
			.setId(key("yorkie_ball"))));
	/** Soft wool chew toy that cheers Mushroom up when used on him. */
	public static final Item YORKIE_CHEW_TOY = register("yorkie_chew_toy", new YorkieChewToyItem(new Item.Properties()
			.stacksTo(16)
			.setId(key("yorkie_chew_toy"))));
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
		YorkieToyThrowHandler.register();
	}

	private static Item register(String name, Item item) {
		return Registry.register(BuiltInRegistries.ITEM, key(name), item);
	}

	private static ResourceKey<Item> key(String name) {
		return ResourceKey.create(Registries.ITEM, MushroomTheYorkie.id(name));
	}
}
