package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.MushroomTheYorkie;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.MobCategory;

/** Registry holder for Mushroom the Yorkie entity types. */
public final class ModEntities {
	/** Small tameable Yorkie companion entity type. */
	public static final EntityType<MushroomYorkieEntity> MUSHROOM_YORKIE = register(
			"mushroom_yorkie",
			EntityType.Builder.of(MushroomYorkieEntity::new, MobCategory.CREATURE)
					.sized(0.42F, 0.46F)
					.eyeHeight(0.32F)
					.clientTrackingRange(8)
					.updateInterval(3)
	);
	/** Tiny woodland squirrel that searches for trees when Mushroom gives chase. */
	public static final EntityType<SquirrelEntity> SQUIRREL = register(
			"squirrel",
			EntityType.Builder.of(SquirrelEntity::new, MobCategory.CREATURE)
					.sized(0.38F, 0.56F)
					.eyeHeight(0.38F)
					.clientTrackingRange(8)
					.updateInterval(3)
	);

	private ModEntities() {
	}

	/** Loads this class so static entity registrations run during mod initialization. */
	public static void initialize() {
	}

	private static <T extends net.minecraft.world.entity.Entity> EntityType<T> register(String name, EntityType.Builder<T> builder) {
		ResourceKey<EntityType<?>> key = ResourceKey.create(Registries.ENTITY_TYPE, MushroomTheYorkie.id(name));
		return Registry.register(BuiltInRegistries.ENTITY_TYPE, key, MushroomEntityTypeBuilder.build(builder, key, name));
	}
}
