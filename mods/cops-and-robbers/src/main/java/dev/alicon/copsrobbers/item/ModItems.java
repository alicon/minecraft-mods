package dev.alicon.copsrobbers.item;

import dev.alicon.copsrobbers.CopsAndRobbers;
import dev.alicon.copsrobbers.entity.ModEntities;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.SpawnEggItem;

/** Registry holder for Cops and Robbers items. */
public final class ModItems {
	/** Spawn egg for creating the Police Cruiser entity. */
	public static final Item POLICE_CRUISER_SPAWN_EGG = register(
			"police_cruiser_spawn_egg",
			new SpawnEggItem(new Item.Properties()
					.spawnEgg(ModEntities.POLICE_CRUISER)
					.stacksTo(64)
					.setId(key("police_cruiser_spawn_egg")))
	);
	/** Spawn egg for creating the Fire Truck entity. */
	public static final Item FIRE_TRUCK_SPAWN_EGG = register(
			"fire_truck_spawn_egg",
			new SpawnEggItem(new Item.Properties()
					.spawnEgg(ModEntities.FIRE_TRUCK)
					.stacksTo(64)
					.setId(key("fire_truck_spawn_egg")))
	);
	/** Spawn egg for testing village robbers in creative mode. */
	public static final Item BANK_ROBBER_SPAWN_EGG = register(
			"bank_robber_spawn_egg",
			new SpawnEggItem(new Item.Properties()
					.spawnEgg(ModEntities.BANK_ROBBER)
					.stacksTo(64)
					.setId(key("bank_robber_spawn_egg")))
	);
	/** Spawn egg for testing bank tellers in creative mode. */
	public static final Item TELLER_SPAWN_EGG = register(
			"teller_spawn_egg",
			new SpawnEggItem(new Item.Properties()
					.spawnEgg(ModEntities.TELLER)
					.stacksTo(64)
					.setId(key("teller_spawn_egg")))
	);
	/** Spawn egg for testing cops in creative mode. */
	public static final Item COP_SPAWN_EGG = register(
			"cop_spawn_egg",
			new SpawnEggItem(new Item.Properties()
					.spawnEgg(ModEntities.COP)
					.stacksTo(64)
					.setId(key("cop_spawn_egg")))
	);
	/** Spawn egg for testing firemen in creative mode. */
	public static final Item FIREMAN_SPAWN_EGG = register(
			"fireman_spawn_egg",
			new SpawnEggItem(new Item.Properties()
					.spawnEgg(ModEntities.FIREMAN)
					.stacksTo(64)
					.setId(key("fireman_spawn_egg")))
	);
	/** Places a compact police station with a jail cell and cruiser garage. */
	public static final Item POLICE_STATION_KIT = register(
			"police_station_kit",
			new PoliceStationKitItem(new Item.Properties()
					.stacksTo(16)
					.setId(key("police_station_kit")))
	);
	/** Places a small burnable bank with tellers and a vault. */
	public static final Item BANK_KIT = register(
			"bank_kit",
			new BankKitItem(new Item.Properties()
					.stacksTo(16)
					.setId(key("bank_kit")))
	);
	/** Places a compact fire station with a fire truck bay. */
	public static final Item FIRE_STATION_KIT = register(
			"fire_station_kit",
			new FireStationKitItem(new Item.Properties()
					.stacksTo(16)
					.setId(key("fire_station_kit")))
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
		return ResourceKey.create(Registries.ITEM, CopsAndRobbers.id(name));
	}
}
