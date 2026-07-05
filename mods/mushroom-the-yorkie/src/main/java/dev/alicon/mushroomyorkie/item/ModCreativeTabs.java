package dev.alicon.mushroomyorkie.item;

import dev.alicon.mushroomyorkie.MushroomTheYorkie;
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

/** Creative inventory tabs and vanilla tab placement for Mushroom items. */
public final class ModCreativeTabs {
	/** Creative tab that groups all Mushroom the Yorkie items in one kid-friendly place. */
	public static final ResourceKey<CreativeModeTab> MUSHROOM_YORKIE = ResourceKey.create(
			Registries.CREATIVE_MODE_TAB,
			MushroomTheYorkie.id("mushroom_yorkie")
	);

	private ModCreativeTabs() {
	}

	/** Registers the custom creative tab and adds Mushroom items to relevant vanilla tabs. */
	public static void initialize() {
		Registry.register(BuiltInRegistries.CREATIVE_MODE_TAB, MUSHROOM_YORKIE, FabricItemGroup.builder()
				.title(Component.translatable("itemGroup.mushroom_yorkie.main"))
				.icon(() -> new ItemStack(ModItems.MUSHROOM_YORKIE_SPAWN_EGG))
				.displayItems((parameters, output) -> {
					output.accept(ModItems.MUSHROOM_YORKIE_SPAWN_EGG);
					output.accept(ModItems.YORKIE_TREAT);
					output.accept(ModItems.YORKIE_HARNESS);
					output.accept(ModItems.DOG_BOWL);
					output.accept(ModItems.DOG_FOOD_BOWL);
					output.accept(ModItems.DOG_WATER_BOWL);
					output.accept(ModItems.DOG_BED);
					output.accept(ModItems.YORKIE_BALL);
					output.accept(ModItems.YORKIE_CHEW_TOY);
				})
				.build());

		ItemGroupEvents.modifyEntriesEvent(CreativeModeTabs.SPAWN_EGGS).register(entries ->
				entries.accept(ModItems.MUSHROOM_YORKIE_SPAWN_EGG));
		ItemGroupEvents.modifyEntriesEvent(CreativeModeTabs.FOOD_AND_DRINKS).register(entries ->
				entries.accept(ModItems.YORKIE_TREAT));
		ItemGroupEvents.modifyEntriesEvent(CreativeModeTabs.TOOLS_AND_UTILITIES).register(entries ->
				entries.accept(ModItems.YORKIE_HARNESS));
		ItemGroupEvents.modifyEntriesEvent(CreativeModeTabs.FUNCTIONAL_BLOCKS).register(entries -> {
			entries.accept(ModItems.DOG_BOWL);
			entries.accept(ModItems.DOG_FOOD_BOWL);
			entries.accept(ModItems.DOG_WATER_BOWL);
			entries.accept(ModItems.DOG_BED);
		});
		ItemGroupEvents.modifyEntriesEvent(CreativeModeTabs.TOOLS_AND_UTILITIES).register(entries -> {
			entries.accept(ModItems.YORKIE_BALL);
			entries.accept(ModItems.YORKIE_CHEW_TOY);
		});
	}
}
