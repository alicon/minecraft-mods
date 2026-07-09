package dev.alicon.copsrobbers.item;

import dev.alicon.copsrobbers.CopsAndRobbers;
import net.fabricmc.fabric.api.itemgroup.v1.FabricItemGroup;
import net.fabricmc.fabric.api.itemgroup.v1.ItemGroupEvents;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.item.CreativeModeTab;
import net.minecraft.world.item.CreativeModeTabs;
import net.minecraft.world.item.ItemStack;

/** Creative inventory tabs and vanilla tab placement for Cops and Robbers items. */
public final class ModCreativeTabs {
	/** Creative tab that groups all Cops and Robbers items in one place. */
	public static final ResourceKey<CreativeModeTab> COPS_ROBBERS = ResourceKey.create(
			Registries.CREATIVE_MODE_TAB,
			CopsAndRobbers.id("cops_robbers")
	);

	private ModCreativeTabs() {
	}

	/** Registers the custom creative tab and adds the cruiser spawn egg to vanilla spawn eggs. */
	public static void initialize() {
		Registry.register(BuiltInRegistries.CREATIVE_MODE_TAB, COPS_ROBBERS, FabricItemGroup.builder()
				.title(Component.translatable("itemGroup.cops_robbers.main"))
				.icon(() -> new ItemStack(ModItems.POLICE_CRUISER_SPAWN_EGG))
				.displayItems((parameters, output) -> {
					output.accept(ModItems.POLICE_CRUISER_SPAWN_EGG);
					output.accept(ModItems.FIRE_TRUCK_SPAWN_EGG);
					output.accept(ModItems.BANK_ROBBER_SPAWN_EGG);
					output.accept(ModItems.TELLER_SPAWN_EGG);
					output.accept(ModItems.COP_SPAWN_EGG);
					output.accept(ModItems.FIREMAN_SPAWN_EGG);
					output.accept(ModItems.POLICE_STATION_KIT);
					output.accept(ModItems.BANK_KIT);
					output.accept(ModItems.FIRE_STATION_KIT);
				})
				.build());

		ItemGroupEvents.modifyEntriesEvent(CreativeModeTabs.SPAWN_EGGS).register(entries -> {
			entries.accept(ModItems.POLICE_CRUISER_SPAWN_EGG);
			entries.accept(ModItems.FIRE_TRUCK_SPAWN_EGG);
			entries.accept(ModItems.BANK_ROBBER_SPAWN_EGG);
			entries.accept(ModItems.TELLER_SPAWN_EGG);
			entries.accept(ModItems.COP_SPAWN_EGG);
			entries.accept(ModItems.FIREMAN_SPAWN_EGG);
		});
		ItemGroupEvents.modifyEntriesEvent(CreativeModeTabs.TOOLS_AND_UTILITIES).register(entries -> {
			entries.accept(ModItems.POLICE_STATION_KIT);
			entries.accept(ModItems.BANK_KIT);
			entries.accept(ModItems.FIRE_STATION_KIT);
		});
	}
}
