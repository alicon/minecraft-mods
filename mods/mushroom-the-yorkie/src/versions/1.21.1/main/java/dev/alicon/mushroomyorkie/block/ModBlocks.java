package dev.alicon.mushroomyorkie.block;

import dev.alicon.mushroomyorkie.MushroomTheYorkie;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.SoundType;
import net.minecraft.world.level.block.state.BlockBehaviour;

/** Registry holder for Mushroom domestic blocks. */
public final class ModBlocks {
	/** Empty copper dog bowl. */
	public static final Block DOG_BOWL = register("dog_bowl", new DogBowlBlock(bowlProperties()));
	/** Copper bowl with one serving of dog food. */
	public static final Block DOG_FOOD_BOWL = register("dog_food_bowl", new DogBowlBlock(bowlProperties()));
	/** Copper bowl with one serving of water. */
	public static final Block DOG_WATER_BOWL = register("dog_water_bowl", new DogBowlBlock(bowlProperties()));
	/** Soft indoor dog bed for Mushroom. */
	public static final Block DOG_BED = register("dog_bed", new DogBedBlock(woolProperties()));

	private ModBlocks() {
	}

	/** Loads this class so static block registrations run during mod initialization. */
	public static void initialize() {
	}

	private static BlockBehaviour.Properties bowlProperties() {
		return BlockBehaviour.Properties.of()
				.strength(0.2F)
				.sound(SoundType.COPPER)
				.noOcclusion();
	}

	private static BlockBehaviour.Properties woolProperties() {
		return BlockBehaviour.Properties.of()
				.strength(0.3F)
				.sound(SoundType.WOOL)
				.noOcclusion();
	}

	private static Block register(String name, Block block) {
		return Registry.register(BuiltInRegistries.BLOCK, key(name), block);
	}

	private static ResourceKey<Block> key(String name) {
		return ResourceKey.create(Registries.BLOCK, MushroomTheYorkie.id(name));
	}
}
