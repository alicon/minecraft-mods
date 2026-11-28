package dev.alicon.mushroomyorkie.entity;

import com.mojang.serialization.Codec;
import dev.alicon.mushroomyorkie.MushroomTheYorkie;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import net.fabricmc.fabric.api.attachment.v1.AttachmentRegistry;
import net.fabricmc.fabric.api.attachment.v1.AttachmentTarget;
import net.fabricmc.fabric.api.attachment.v1.AttachmentType;
import net.fabricmc.fabric.api.entity.event.v1.ServerLivingEntityEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerEntityEvents;
import net.minecraft.server.level.ServerLevel;

/** Tracks living companions across dimension changes and chunk unloads. */
public final class MushroomCompanions {
	private static final AttachmentType<Map<String, String>> OWNERS = AttachmentRegistry.createPersistent(
			MushroomTheYorkie.id("companion_owners"), Codec.unboundedMap(Codec.STRING, Codec.STRING));

	private MushroomCompanions() {
	}

	/** Registers existing companions as their entity data becomes available. */
	public static void register() {
		ServerEntityEvents.ENTITY_LOAD.register((entity, level) -> {
			if (entity instanceof MushroomYorkieEntity yorkie) {
				record(level, yorkie);
			}
		});
		ServerLivingEntityEvents.AFTER_DEATH.register((entity, damage) -> {
			if (entity instanceof MushroomYorkieEntity yorkie && yorkie.level() instanceof ServerLevel level) {
				forget(level, yorkie);
			}
		});
		ServerEntityEvents.ENTITY_UNLOAD.register((entity, level) -> {
			if (entity instanceof MushroomYorkieEntity yorkie && yorkie.getRemovalReason() != null
					&& yorkie.getRemovalReason().shouldDestroy()) {
				forget(level, yorkie);
			}
		});
	}

	/** Returns whether the owner has a living companion recorded in this world. */
	public static boolean hasLivingCompanion(ServerLevel level, UUID owner) {
		return storage(level).getAttachedOrElse(OWNERS, Map.of()).containsValue(owner.toString());
	}

	static void record(ServerLevel level, MushroomYorkieEntity yorkie) {
		UUID owner = yorkie.companionOwnerId();
		if (owner == null || !yorkie.isAlive()) {
			return;
		}

		AttachmentTarget world = storage(level);
		Map<String, String> owners = world.getAttachedOrElse(OWNERS, Map.of());
		String dogId = yorkie.getStringUUID();
		String ownerId = owner.toString();
		if (!ownerId.equals(owners.get(dogId))) {
			Map<String, String> updated = new HashMap<>(owners);
			updated.put(dogId, ownerId);
			world.setAttached(OWNERS, Map.copyOf(updated));
		}
	}

	private static void forget(ServerLevel level, MushroomYorkieEntity yorkie) {
		AttachmentTarget world = storage(level);
		Map<String, String> owners = world.getAttachedOrElse(OWNERS, Map.of());
		String dogId = yorkie.getStringUUID();
		if (owners.containsKey(dogId)) {
			Map<String, String> updated = new HashMap<>(owners);
			updated.remove(dogId);
			world.setAttached(OWNERS, Map.copyOf(updated));
		}
	}

	private static AttachmentTarget storage(ServerLevel level) {
		return (AttachmentTarget) level.getServer().overworld();
	}
}
