package dev.alicon.mushroomyorkie.block;

import net.minecraft.resources.ResourceKey;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockBehaviour;

final class MushroomBlockProperties {
	private MushroomBlockProperties() {
	}

	static BlockBehaviour.Properties withId(BlockBehaviour.Properties properties, ResourceKey<Block> key) {
		return properties;
	}

	static BlockBehaviour.Properties noCollision(BlockBehaviour.Properties properties) {
		return properties.noCollission();
	}
}
