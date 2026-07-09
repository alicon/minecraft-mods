package dev.alicon.playtestbridge;

import com.google.gson.JsonObject;
import java.util.regex.Pattern;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;

final class BridgeWorldActions {
	private static final Pattern RESOURCE_ID = Pattern.compile("[a-z0-9_.-]+:[a-z0-9_./-]+");
	private static final int MAX_OFFSET = 16;

	private BridgeWorldActions() {
	}

	static JsonObject setBlockNearEntity(ServerPlayer player, JsonObject body) {
		Entity target = BridgeEntityActions.targetEntityFromBody(player, body);
		if (!(target.level() instanceof ServerLevel level)) {
			throw new IllegalArgumentException("target is not in a server level");
		}

		Block block = blockFromId(requiredString(body, "block"));
		BlockPos position = target.blockPosition().offset(
				optionalInt(body, "dx", 0, -MAX_OFFSET, MAX_OFFSET),
				optionalInt(body, "dy", 0, -MAX_OFFSET, MAX_OFFSET),
				optionalInt(body, "dz", 0, -MAX_OFFSET, MAX_OFFSET)
		);
		JsonObject response = setBlock(level, position, block, body);
		response.add("target", BridgeEntityState.entityState(player, target));
		return response;
	}

	static JsonObject setBlock(ServerPlayer player, JsonObject body) {
		if (!(player.level() instanceof ServerLevel level)) {
			throw new IllegalArgumentException("player is not in a server level");
		}

		Block block = blockFromId(requiredString(body, "block"));
		BlockPos position = new BlockPos(
				requiredInt(body, "x"),
				requiredInt(body, "y"),
				requiredInt(body, "z")
		);
		return setBlock(level, position, block, body);
	}

	static JsonObject block(ServerPlayer player, JsonObject body) {
		if (!(player.level() instanceof ServerLevel level)) {
			throw new IllegalArgumentException("player is not in a server level");
		}

		BlockPos position = new BlockPos(
				requiredInt(body, "x"),
				requiredInt(body, "y"),
				requiredInt(body, "z")
		);
		return block(level, position);
	}

	private static JsonObject setBlock(ServerLevel level, BlockPos position, Block block, JsonObject body) {
		BlockState previous = level.getBlockState(position);
		boolean changed = true;
		String replace = optionalString(body, "replace", "");
		if (!replace.isBlank()) {
			changed = blockId(previous).equals(resourceId(replace, "replace"));
		}
		if (changed) {
			level.setBlockAndUpdate(position, block.defaultBlockState());
		}

		JsonObject response = new JsonObject();
		response.addProperty("ok", true);
		response.addProperty("changed", changed);
		response.addProperty("block", BuiltInRegistries.BLOCK.getKey(block).toString());
		response.addProperty("previousBlock", blockId(previous));
		response.add("position", BridgeEntityState.blockPosition(position));
		return response;
	}

	private static JsonObject block(ServerLevel level, BlockPos position) {
		JsonObject response = new JsonObject();
		response.addProperty("ok", true);
		response.addProperty("block", blockId(level.getBlockState(position)));
		response.add("position", BridgeEntityState.blockPosition(position));
		return response;
	}

	private static Block blockFromId(String blockId) {
		String checked = resourceId(blockId, "block");
		return BuiltInRegistries.BLOCK.getOptional(Identifier.parse(checked))
				.orElseThrow(() -> new IllegalArgumentException("unknown block: " + checked));
	}

	private static String blockId(BlockState state) {
		return BuiltInRegistries.BLOCK.getKey(state.getBlock()).toString();
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

	private static int requiredInt(JsonObject object, String name) {
		if (!object.has(name) || object.get(name).isJsonNull()) {
			throw new IllegalArgumentException("missing integer field: " + name);
		}
		return object.get(name).getAsInt();
	}

	private static String resourceId(String value, String name) {
		if (!RESOURCE_ID.matcher(value).matches()) {
			throw new IllegalArgumentException(name + " must be a namespaced id like minecraft:stone");
		}
		return value;
	}
}
