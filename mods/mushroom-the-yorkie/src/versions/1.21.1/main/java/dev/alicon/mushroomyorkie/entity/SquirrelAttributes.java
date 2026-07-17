package dev.alicon.mushroomyorkie.entity;

import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.animal.Animal;

final class SquirrelAttributes {
	private SquirrelAttributes() {
	}

	static AttributeSupplier.Builder create() {
		return Animal.createMobAttributes()
				.add(Attributes.MAX_HEALTH, 8.0D)
				.add(Attributes.MOVEMENT_SPEED, 0.34D)
				.add(Attributes.FOLLOW_RANGE, 28.0D);
	}
}
