package dev.alicon.mushroomyorkie.client;

import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.EntityRenderers;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;

final class MushroomEntityRendererRegistration {
	private MushroomEntityRendererRegistration() {
	}

	static <T extends Entity> void register(EntityType<? extends T> entityType, EntityRendererProvider<T> provider) {
		EntityRenderers.register(entityType, provider);
	}
}
