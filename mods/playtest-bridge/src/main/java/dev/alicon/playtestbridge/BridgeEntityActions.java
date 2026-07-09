package dev.alicon.playtestbridge;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
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
	private static final Pattern RESOURCE_ID = Pattern.compile("[a-z0-9_.-]+:[a-z0-9_./-]+");

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

	private static String requiredString(JsonObject object, String name) {
		if (!object.has(name) || !object.get(name).isJsonPrimitive()) {
			throw new IllegalArgumentException("missing string field: " + name);
		}
		String value = object.get(name).getAsString();
		if (value.isBlank()) {
			throw new IllegalArgumentException(name + " cannot be blank");
		}
		return value;
	}

	private static String optionalString(JsonObject object, String name, String fallback) {
		if (!object.has(name) || object.get(name).isJsonNull()) {
			return fallback;
		}
		return object.get(name).getAsString();
	}

	private static int optionalInt(JsonObject object, String name, int fallback, int min, int max) {
		if (!object.has(name) || object.get(name).isJsonNull()) {
			return fallback;
		}
		int value = object.get(name).getAsInt();
		if (value < min || value > max) {
			throw new IllegalArgumentException(name + " must be between " + min + " and " + max);
		}
		return value;
	}

	private static double optionalDouble(JsonObject object, String name, double fallback, double min, double max) {
		if (!object.has(name) || object.get(name).isJsonNull()) {
			return fallback;
		}
		double value = object.get(name).getAsDouble();
		if (!Double.isFinite(value) || value < min || value > max) {
			throw new IllegalArgumentException(name + " must be between " + min + " and " + max);
		}
		return value;
	}

	private static boolean optionalBoolean(JsonObject object, String name, boolean fallback) {
		if (!object.has(name) || object.get(name).isJsonNull()) {
			return fallback;
		}
		String value = object.get(name).getAsString().toLowerCase(java.util.Locale.ROOT);
		return switch (value) {
			case "1", "true", "yes", "on" -> true;
			case "0", "false", "no", "off" -> false;
			default -> throw new IllegalArgumentException(name + " must be true or false");
		};
	}

	private static String resourceId(String value, String name) {
		if (!RESOURCE_ID.matcher(value).matches()) {
			throw new IllegalArgumentException(name + " must be a namespaced id like minecraft:pig");
		}
		return value;
	}
}
