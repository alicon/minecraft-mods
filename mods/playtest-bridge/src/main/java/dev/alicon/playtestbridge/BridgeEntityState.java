package dev.alicon.playtestbridge;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.List;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.Leashable;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.TamableAnimal;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

final class BridgeEntityState {
	private static final double NEARBY_ENTITY_RADIUS = 32.0D;

	private BridgeEntityState() {
	}

	static JsonObject playerState(ServerPlayer player) {
		JsonObject state = new JsonObject();
		state.addProperty("name", player.getGameProfile().name());
		state.addProperty("uuid", player.getGameProfile().id().toString());
		state.addProperty("health", player.getHealth());
		state.addProperty("food", player.getFoodData().getFoodLevel());
		state.addProperty("dimension", player.level().dimension().toString());
		state.add("position", position(player.position()));
		state.add("abilities", playerAbilities(player));
		state.add("nearbyEntities", nearbyEntities(player));
		return state;
	}

	static JsonObject playerAbilities(ServerPlayer player) {
		JsonObject abilities = new JsonObject();
		abilities.addProperty("creative", player.isCreative());
		abilities.addProperty("spectator", player.isSpectator());
		abilities.addProperty("flying", player.getAbilities().flying);
		abilities.addProperty("mayfly", player.getAbilities().mayfly);
		return abilities;
	}

	static JsonArray nearbyEntities(ServerPlayer player) {
		JsonArray entities = new JsonArray();
		if (!(player.level() instanceof ServerLevel level)) {
			return entities;
		}

		AABB area = player.getBoundingBox().inflate(NEARBY_ENTITY_RADIUS);
		List<Entity> nearby = level.getEntities(player, area, Entity::isAlive);
		for (Entity entity : nearby) {
			entities.add(entityState(player, entity));
		}
		return entities;
	}

	static JsonObject entityState(ServerPlayer player, Entity entity) {
		JsonObject state = new JsonObject();
		state.addProperty("id", entity.getId());
		state.addProperty("type", BuiltInRegistries.ENTITY_TYPE.getKey(entity.getType()).toString());
		state.addProperty("name", entity.getName().getString());
		state.addProperty("distance", round(player.distanceTo(entity)));
		state.addProperty("dimension", entity.level().dimension().toString());
		state.addProperty("noGravity", entity.isNoGravity());
		state.addProperty("inWater", entity.isInWater());
		state.add("position", position(entity.position()));
		if (entity instanceof LivingEntity living) {
			state.addProperty("health", round(living.getHealth()));
			state.addProperty("maxHealth", round(living.getMaxHealth()));
		}
		if (entity instanceof TamableAnimal tameable) {
			JsonObject tameableState = new JsonObject();
			tameableState.addProperty("tame", tameable.isTame());
			tameableState.addProperty("sittingPose", tameable.isInSittingPose());
			tameableState.addProperty("orderedToSit", tameable.isOrderedToSit());
			tameableState.addProperty("ownedByPlayer", tameable.isOwnedBy(player));
			state.add("tameable", tameableState);
		}
		if (entity instanceof Leashable leashable) {
			JsonObject leashState = new JsonObject();
			leashState.addProperty("leashed", leashable.isLeashed());
			Entity holder = leashable.getLeashHolder();
			if (holder != null) {
				leashState.addProperty("holderId", holder.getId());
				leashState.addProperty("holderType", BuiltInRegistries.ENTITY_TYPE.getKey(holder.getType()).toString());
				leashState.addProperty("holderName", holder.getName().getString());
			}
			state.add("leash", leashState);
		}
		if (entity instanceof ItemEntity itemEntity) {
			state.add("item", itemStack(itemEntity.getItem()));
		}
		JsonObject custom = customState(entity);
		if (custom.size() > 0) {
			state.add("custom", custom);
		}
		return state;
	}

	static JsonObject position(Vec3 position) {
		JsonObject value = new JsonObject();
		value.addProperty("x", round(position.x));
		value.addProperty("y", round(position.y));
		value.addProperty("z", round(position.z));
		return value;
	}

	static JsonObject blockPosition(BlockPos position) {
		JsonObject value = new JsonObject();
		value.addProperty("x", position.getX());
		value.addProperty("y", position.getY());
		value.addProperty("z", position.getZ());
		return value;
	}

	static JsonObject itemStack(ItemStack stack) {
		JsonObject value = new JsonObject();
		value.addProperty("id", BuiltInRegistries.ITEM.getKey(stack.getItem()).toString());
		value.addProperty("count", stack.getCount());
		value.addProperty("empty", stack.isEmpty());
		return value;
	}

	private static JsonObject customState(Entity entity) {
		JsonObject custom = new JsonObject();
		putBooleanMethod(custom, entity, "hasHarness");
		putBooleanMethod(custom, entity, "isCurledUpSleeping");
		putIntegerMethod(custom, entity, "getFlightTrickType");
		putIntegerMethod(custom, entity, "getFlightTrickTicks");
		putNeeds(custom, entity);
		putDomestic(custom, entity);
		return custom;
	}

	private static void putNeeds(JsonObject custom, Entity entity) {
		Object needs = fieldValue(entity, "needs");
		if (needs == null) {
			return;
		}

		JsonObject state = new JsonObject();
		putIntegerMethod(state, needs, "hunger");
		putIntegerMethod(state, needs, "potty");
		putIntegerMethod(state, needs, "mood");
		putIntegerMethod(state, needs, "energy");
		putIntegerMethod(state, needs, "foodPips");
		if (state.size() > 0) {
			custom.add("needs", state);
		}
	}

	private static void putDomestic(JsonObject custom, Entity entity) {
		Object domestic = fieldValue(entity, "domestic");
		if (domestic == null) {
			return;
		}

		JsonObject state = new JsonObject();
		putLongMethod(state, domestic, "lastFoodBowlDay");
		putLongMethod(state, domestic, "lastWaterBowlDay");
		if (state.size() > 0) {
			custom.add("domestic", state);
		}
	}

	private static void putBooleanMethod(JsonObject custom, Object target, String methodName) {
		Object value = invokeNoArg(target, methodName);
		if (value instanceof Boolean booleanValue) {
			custom.addProperty(propertyName(methodName), booleanValue);
		}
	}

	private static void putIntegerMethod(JsonObject custom, Object target, String methodName) {
		Object value = invokeNoArg(target, methodName);
		if (value instanceof Number number) {
			custom.addProperty(propertyName(methodName), number.intValue());
		}
	}

	private static void putLongMethod(JsonObject custom, Object target, String methodName) {
		Object value = invokeNoArg(target, methodName);
		if (value instanceof Number number) {
			custom.addProperty(propertyName(methodName), number.longValue());
		}
	}

	private static Object invokeNoArg(Object target, String methodName) {
		try {
			Method method = method(target.getClass(), methodName);
			method.setAccessible(true);
			return method.invoke(target);
		} catch (ReflectiveOperationException exception) {
			return null;
		}
	}

	private static Method method(Class<?> type, String methodName) throws NoSuchMethodException {
		try {
			return type.getMethod(methodName);
		} catch (NoSuchMethodException exception) {
			Class<?> current = type;
			while (current != null) {
				try {
					return current.getDeclaredMethod(methodName);
				} catch (NoSuchMethodException ignored) {
					current = current.getSuperclass();
				}
			}
			throw exception;
		}
	}

	private static Object fieldValue(Object target, String fieldName) {
		Class<?> current = target.getClass();
		while (current != null) {
			try {
				Field field = current.getDeclaredField(fieldName);
				field.setAccessible(true);
				return field.get(target);
			} catch (ReflectiveOperationException exception) {
				current = current.getSuperclass();
			}
		}
		return null;
	}

	private static String propertyName(String methodName) {
		if (methodName.startsWith("get")) {
			return decapitalize(methodName.substring(3));
		}
		if (methodName.startsWith("is")) {
			return decapitalize(methodName.substring(2));
		}
		if (methodName.startsWith("has")) {
			return decapitalize(methodName.substring(3));
		}
		return methodName;
	}

	private static String decapitalize(String value) {
		if (value.isEmpty()) {
			return value;
		}
		return Character.toLowerCase(value.charAt(0)) + value.substring(1);
	}

	private static double round(double value) {
		return Math.round(value * 100.0D) / 100.0D;
	}
}
