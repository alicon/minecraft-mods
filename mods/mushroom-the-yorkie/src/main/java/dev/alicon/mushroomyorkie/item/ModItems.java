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
	public static final Item YORKIE_TREAT = register("yorkie_treat", new Item(properties("yorkie_treat", 64)));
	/** Small black harness that lets Mushroom safely wear a lead. */
	public static final Item YORKIE_HARNESS = register("yorkie_harness", new Item(properties("yorkie_harness", 1)));
	/** Copper dog bowl that can be placed in a Mushroom home. */
	public static final Item DOG_BOWL = register("dog_bowl", new BlockItem(ModBlocks.DOG_BOWL, properties("dog_bowl", 16)));
	/** Dog bowl filled with one serving of food for Mushroom. */
	public static final Item DOG_FOOD_BOWL = register("dog_food_bowl", new BlockItem(ModBlocks.DOG_FOOD_BOWL, properties("dog_food_bowl", 16)));
	/** Dog bowl filled with water for Mushroom. */
	public static final Item DOG_WATER_BOWL = register("dog_water_bowl", new BlockItem(ModBlocks.DOG_WATER_BOWL, properties("dog_water_bowl", 16)));
	/** Soft placeable bed that Mushroom can curl up on at night. */
	public static final Item DOG_BED = register("dog_bed", new BlockItem(ModBlocks.DOG_BED, properties("dog_bed", 16)));
	/** Cozy placeable doghouse with a bed and a tiny warm light for Mushroom. */
	public static final Item DOGHOUSE = register("doghouse", new BlockItem(ModBlocks.DOGHOUSE, properties("doghouse", 16)));
	/** Wool toy ball Mushroom can fetch when dropped away from his owner. */
	public static final Item YORKIE_BALL = register("yorkie_ball", new YorkieBallItem(properties("yorkie_ball", 16)));
	/** Soft wool chew toy that cheers Mushroom up when used on him. */
	public static final Item YORKIE_CHEW_TOY = register("yorkie_chew_toy", new YorkieChewToyItem(properties("yorkie_chew_toy", 16)));
	/** Spawn egg for creating the Mushroom Yorkie entity. */
	public static final Item MUSHROOM_YORKIE_SPAWN_EGG = register(
				"mushroom_yorkie_spawn_egg",
				new MushroomYorkieSpawnEggItem(MushroomItemProperties.spawnEgg(
						properties("mushroom_yorkie_spawn_egg", 64),
						ModEntities.MUSHROOM_YORKIE
				))
	);
	/** Spawn egg for the tree-seeking woodland squirrel. */
	public static final Item SQUIRREL_SPAWN_EGG = register(
			"squirrel_spawn_egg",
			new SquirrelSpawnEggItem(MushroomItemProperties.spawnEgg(
					properties("squirrel_spawn_egg", 64),
					ModEntities.SQUIRREL
			))
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

	private static Item.Properties properties(String name, int maxStackSize) {
		return MushroomItemProperties.withId(new Item.Properties().stacksTo(maxStackSize), key(name));
	}

	private static ResourceKey<Item> key(String name) {
		return ResourceKey.create(Registries.ITEM, MushroomTheYorkie.id(name));
	}
}
