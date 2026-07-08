package dev.alicon.mushroomyorkie.client;

import net.fabricmc.fabric.api.client.rendering.v1.EntityRendererRegistry;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;

final class MushroomEntityRendererRegistration {
	private MushroomEntityRendererRegistration() {
	}

	static <T extends Entity> void register(EntityType<? extends T> entityType, EntityRendererProvider<T> provider) {
		EntityRendererRegistry.register(entityType, provider);
	}
}
