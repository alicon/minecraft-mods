package dev.alicon.mushroomyorkie.entity;

import net.minecraft.resources.ResourceKey;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;

final class MushroomEntityTypeBuilder {
	private MushroomEntityTypeBuilder() {
	}

	static <T extends Entity> EntityType<T> build(EntityType.Builder<T> builder, ResourceKey<EntityType<?>> key, String name) {
		return builder.build(name);
	}
}
