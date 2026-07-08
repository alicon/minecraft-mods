package dev.alicon.mushroomyorkie.entity;

import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.animal.Animal;

final class MushroomYorkieAttributes {
	private MushroomYorkieAttributes() {
	}

	static AttributeSupplier.Builder create() {
		return Animal.createAnimalAttributes()
				.add(Attributes.MAX_HEALTH, 12.0D)
				.add(Attributes.MOVEMENT_SPEED, 0.34D)
				.add(Attributes.FOLLOW_RANGE, 24.0D)
				.add(Attributes.ATTACK_DAMAGE, 1.0D)
				.add(Attributes.STEP_HEIGHT, 1.0D);
	}
}
