package dev.alicon.playtestbridge;

import static dev.alicon.playtestbridge.BridgeJsonFields.optionalBoolean;
import static dev.alicon.playtestbridge.BridgeJsonFields.optionalDouble;
import static dev.alicon.playtestbridge.BridgeJsonFields.optionalInt;
import static dev.alicon.playtestbridge.BridgeJsonFields.optionalString;
import static dev.alicon.playtestbridge.BridgeJsonFields.requiredString;
import static dev.alicon.playtestbridge.BridgeJsonFields.resourceId;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.phys.AABB;

final class BridgeEntityActions {
	private static final double DEFAULT_USE_ENTITY_RADIUS = 6.0D;
	private static final double MAX_USE_ENTITY_RADIUS = 64.0D;

	private BridgeEntityActions() {
	}

	static JsonObject useEntity(ServerPlayer player, JsonObject body) {
		Entity target = targetEntityFromBody(player, body);
		if (optionalBoolean(body, "emptyHand", false)) {
			player.setItemInHand(InteractionHand.MAIN_HAND, ItemStack.EMPTY);
		}
		String itemId = optionalString(body, "item", "");
		if (!itemId.isBlank()) {
			Item item = itemFromId(itemId);
			int count = optionalInt(body, "count", 1, 1, 64);
			player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(item, count));
		}

		InteractionResult result = target.interact(player, InteractionHand.MAIN_HAND);
		JsonObject response = new JsonObject();
		response.addProperty("ok", true);
		response.addProperty("player", player.getGameProfile().name());
		response.addProperty("interaction", result.toString());
		response.addProperty("consumed", result.consumesAction());
		response.add("target", BridgeEntityState.entityState(player, target));
		return response;
	}

	static JsonObject clearEntities(MinecraftServer server, JsonObject body) {
		String type = resourceId(requiredString(body, "type"), "type");
		List<Entity> targets = new ArrayList<>();
		for (ServerLevel level : server.getAllLevels()) {
			for (Entity entity : level.getAllEntities()) {
				String entityType = BuiltInRegistries.ENTITY_TYPE.getKey(entity.getType()).toString();
				if (type.equals(entityType)) {
					targets.add(entity);
				}
			}
		}

		JsonArray removed = new JsonArray();
		for (Entity entity : targets) {
			JsonObject value = new JsonObject();
			value.addProperty("id", entity.getId());
			value.addProperty("name", entity.getName().getString());
			value.addProperty("dimension", entity.level().dimension().toString());
			removed.add(value);
			entity.discard();
		}

		JsonObject response = new JsonObject();
		response.addProperty("ok", true);
		response.addProperty("type", type);
		response.addProperty("count", targets.size());
		response.add("removed", removed);
		return response;
	}

	static Entity targetEntityFromBody(ServerPlayer player, JsonObject object) {
		String type = resourceId(requiredString(object, "type"), "type");
		double radius = optionalDouble(object, "radius", DEFAULT_USE_ENTITY_RADIUS, 1.0D, MAX_USE_ENTITY_RADIUS);
		if (!(player.level() instanceof ServerLevel level)) {
			throw new IllegalArgumentException("player is not in a server level");
		}

		AABB area = player.getBoundingBox().inflate(radius);
		Entity nearest = null;
		double nearestDistance = radius * radius;
		for (Entity entity : level.getEntities(player, area, Entity::isAlive)) {
			String entityType = BuiltInRegistries.ENTITY_TYPE.getKey(entity.getType()).toString();
			if (!type.equals(entityType)) {
				continue;
			}
			double distance = player.distanceToSqr(entity);
			if (distance <= nearestDistance) {
				nearest = entity;
				nearestDistance = distance;
			}
		}
		if (nearest == null) {
			throw new IllegalArgumentException("no entity found within radius " + radius + " for type " + type);
		}
		return nearest;
	}

	private static Item itemFromId(String itemId) {
		String checked = resourceId(itemId, "item");
		return BuiltInRegistries.ITEM.getOptional(Identifier.parse(checked))
				.orElseThrow(() -> new IllegalArgumentException("unknown item: " + checked));
	}
}
