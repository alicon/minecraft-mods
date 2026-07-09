package dev.alicon.playtestbridge;

import com.google.gson.JsonObject;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.Holder;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.tags.BlockTags;
import net.minecraft.tags.FluidTags;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.Property;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;

final class BridgeWorldActions {
	private static final Pattern RESOURCE_ID = Pattern.compile("[a-z0-9_.-]+:[a-z0-9_./-]+");
	private static final int MAX_OFFSET = 16;
	private static final int MAX_COUNT_BLOCK_VOLUME = 65536;
	private static final int MAX_TERRAIN_SCAN_RADIUS = 256;

	private BridgeWorldActions() {
	}

	static JsonObject setBlockNearEntity(ServerPlayer player, JsonObject body) {
		Entity target = BridgeEntityActions.targetEntityFromBody(player, body);
		if (!(target.level() instanceof ServerLevel level)) {
			throw new IllegalArgumentException("target is not in a server level");
		}

		BlockState state = blockStateFromString(requiredString(body, "block"), "block");
		BlockPos position = target.blockPosition().offset(
				optionalInt(body, "dx", 0, -MAX_OFFSET, MAX_OFFSET),
				optionalInt(body, "dy", 0, -MAX_OFFSET, MAX_OFFSET),
				optionalInt(body, "dz", 0, -MAX_OFFSET, MAX_OFFSET)
		);
		JsonObject response = setBlock(level, position, state, body);
		response.add("target", BridgeEntityState.entityState(player, target));
		return response;
	}

	static JsonObject setBlock(ServerPlayer player, JsonObject body) {
		if (!(player.level() instanceof ServerLevel level)) {
			throw new IllegalArgumentException("player is not in a server level");
		}

		BlockState state = blockStateFromString(requiredString(body, "block"), "block");
		BlockPos position = new BlockPos(
				requiredInt(body, "x"),
				requiredInt(body, "y"),
				requiredInt(body, "z")
		);
		return setBlock(level, position, state, body);
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

	static JsonObject useBlock(ServerPlayer player, JsonObject body) {
		if (!(player.level() instanceof ServerLevel level)) {
			throw new IllegalArgumentException("player is not in a server level");
		}

		String itemId = resourceId(requiredString(body, "item"), "item");
		Item item = BuiltInRegistries.ITEM.getOptional(Identifier.parse(itemId))
				.orElseThrow(() -> new IllegalArgumentException("unknown item: " + itemId));
		int count = optionalInt(body, "count", 1, 1, 64);
		BlockPos position = new BlockPos(
				requiredInt(body, "x"),
				requiredInt(body, "y"),
				requiredInt(body, "z")
		);
		Direction face = direction(optionalString(body, "face", "up"));
		double hitX = optionalDouble(body, "hitX", 0.5D, 0.0D, 1.0D);
		double hitY = optionalDouble(body, "hitY", 1.0D, 0.0D, 1.0D);
		double hitZ = optionalDouble(body, "hitZ", 0.5D, 0.0D, 1.0D);
		ItemStack stack = new ItemStack(item, count);
		player.setItemInHand(InteractionHand.MAIN_HAND, stack);
		BlockHitResult hit = new BlockHitResult(
				Vec3.atLowerCornerOf(position).add(hitX, hitY, hitZ),
				face,
				position,
				false
		);
		InteractionResult interaction = player.gameMode.useItemOn(player, level, stack, InteractionHand.MAIN_HAND, hit);

		JsonObject response = new JsonObject();
		response.addProperty("ok", true);
		response.addProperty("player", player.getGameProfile().name());
		response.addProperty("item", itemId);
		response.addProperty("interaction", interaction.toString());
		response.addProperty("consumed", interaction.consumesAction());
		response.add("target", block(level, position));
		response.add("heldItem", BridgeEntityState.itemStack(player.getItemInHand(InteractionHand.MAIN_HAND)));
		return response;
	}

	static JsonObject countBlocks(ServerPlayer player, JsonObject body) {
		if (!(player.level() instanceof ServerLevel level)) {
			throw new IllegalArgumentException("player is not in a server level");
		}

		BlockPos first = new BlockPos(
				requiredInt(body, "x1"),
				requiredInt(body, "y1"),
				requiredInt(body, "z1")
		);
		BlockPos second = new BlockPos(
				requiredInt(body, "x2"),
				requiredInt(body, "y2"),
				requiredInt(body, "z2")
		);
		int minX = Math.min(first.getX(), second.getX());
		int minY = Math.min(first.getY(), second.getY());
		int minZ = Math.min(first.getZ(), second.getZ());
		int maxX = Math.max(first.getX(), second.getX());
		int maxY = Math.max(first.getY(), second.getY());
		int maxZ = Math.max(first.getZ(), second.getZ());
		long volume = (long) (maxX - minX + 1) * (long) (maxY - minY + 1) * (long) (maxZ - minZ + 1);
		if (volume > MAX_COUNT_BLOCK_VOLUME) {
			throw new IllegalArgumentException("count-blocks volume must be at most " + MAX_COUNT_BLOCK_VOLUME);
		}

		Map<String, Integer> counts = new LinkedHashMap<>();
		for (BlockPos position : BlockPos.betweenClosed(minX, minY, minZ, maxX, maxY, maxZ)) {
			String blockId = blockId(level.getBlockState(position));
			counts.merge(blockId, 1, Integer::sum);
		}

		JsonObject countJson = new JsonObject();
		for (Map.Entry<String, Integer> entry : counts.entrySet()) {
			countJson.addProperty(entry.getKey(), entry.getValue());
		}

		JsonObject response = new JsonObject();
		response.addProperty("ok", true);
		response.addProperty("volume", volume);
		response.add("min", BridgeEntityState.blockPosition(new BlockPos(minX, minY, minZ)));
		response.add("max", BridgeEntityState.blockPosition(new BlockPos(maxX, maxY, maxZ)));
		response.add("counts", countJson);
		return response;
	}

	static JsonObject terrainScan(ServerPlayer player, JsonObject body) {
		if (!(player.level() instanceof ServerLevel level)) {
			throw new IllegalArgumentException("player is not in a server level");
		}

		int centerX = optionalRawInt(body, "x", player.blockPosition().getX());
		int centerZ = optionalRawInt(body, "z", player.blockPosition().getZ());
		int radius = optionalInt(body, "radius", 48, 4, MAX_TERRAIN_SCAN_RADIUS);
		int step = optionalInt(body, "step", 8, 1, 32);
		int minY = Integer.MAX_VALUE;
		int maxY = Integer.MIN_VALUE;
		long totalY = 0L;
		int samples = 0;
		int waterSamples = 0;
		int leafColumns = 0;
		int logColumns = 0;
		int openSkySamples = 0;
		Map<String, Integer> topBlocks = new LinkedHashMap<>();
		Map<String, Integer> biomes = new LinkedHashMap<>();

		for (int x = centerX - radius; x <= centerX + radius; x += step) {
			for (int z = centerZ - radius; z <= centerZ + radius; z += step) {
				int surfaceY = level.getHeight(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, x, z);
				BlockPos surface = new BlockPos(x, surfaceY, z);
				BlockState top = level.getBlockState(surface.below());
				samples++;
				minY = Math.min(minY, surfaceY);
				maxY = Math.max(maxY, surfaceY);
				totalY += surfaceY;
				if (top.getFluidState().is(FluidTags.WATER)) {
					waterSamples++;
				}
				if (level.canSeeSky(surface)) {
					openSkySamples++;
				}
				if (hasTaggedBlock(level, surface, BlockTags.LEAVES, 18)) {
					leafColumns++;
				}
				if (hasTaggedBlock(level, surface, BlockTags.LOGS, 18)) {
					logColumns++;
				}
				topBlocks.merge(blockId(top), 1, Integer::sum);
				biomes.merge(biomeId(level, surface), 1, Integer::sum);
			}
		}

		int centerY = level.getHeight(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, centerX, centerZ);
		BlockPos center = new BlockPos(centerX, centerY, centerZ);
		JsonObject response = new JsonObject();
		response.addProperty("ok", true);
		response.addProperty("seed", level.getSeed());
		response.add("center", BridgeEntityState.blockPosition(center));
		response.addProperty("centerBiome", biomeId(level, center));
		response.addProperty("centerTopBlock", blockId(level.getBlockState(center.below())));
		response.addProperty("radius", radius);
		response.addProperty("step", step);
		response.addProperty("samples", samples);
		response.addProperty("minY", minY);
		response.addProperty("maxY", maxY);
		response.addProperty("heightRange", maxY - minY);
		response.addProperty("averageY", samples == 0 ? 0.0D : (double) totalY / (double) samples);
		response.addProperty("waterSamples", waterSamples);
		response.addProperty("waterRatio", samples == 0 ? 0.0D : (double) waterSamples / (double) samples);
		response.addProperty("leafColumns", leafColumns);
		response.addProperty("leafRatio", samples == 0 ? 0.0D : (double) leafColumns / (double) samples);
		response.addProperty("logColumns", logColumns);
		response.addProperty("logRatio", samples == 0 ? 0.0D : (double) logColumns / (double) samples);
		response.addProperty("openSkySamples", openSkySamples);
		response.addProperty("openSkyRatio", samples == 0 ? 0.0D : (double) openSkySamples / (double) samples);
		response.add("topBlocks", countsJson(topBlocks));
		response.add("biomes", countsJson(biomes));
		return response;
	}

	private static JsonObject setBlock(ServerLevel level, BlockPos position, BlockState state, JsonObject body) {
		BlockState previous = level.getBlockState(position);
		boolean changed = true;
		String replace = optionalString(body, "replace", "");
		if (!replace.isBlank()) {
			changed = matchesReplace(previous, replace);
		}
		if (changed) {
			level.setBlockAndUpdate(position, state);
		}

		JsonObject response = new JsonObject();
		response.addProperty("ok", true);
		response.addProperty("changed", changed);
		response.addProperty("block", blockId(state));
		response.addProperty("state", blockStateId(state));
		response.addProperty("previousBlock", blockId(previous));
		response.addProperty("previousState", blockStateId(previous));
		response.add("position", BridgeEntityState.blockPosition(position));
		return response;
	}

	private static JsonObject block(ServerLevel level, BlockPos position) {
		JsonObject response = new JsonObject();
		response.addProperty("ok", true);
		response.addProperty("block", blockId(level.getBlockState(position)));
		response.addProperty("state", blockStateId(level.getBlockState(position)));
		response.add("position", BridgeEntityState.blockPosition(position));
		return response;
	}

	private static boolean hasTaggedBlock(ServerLevel level, BlockPos surface, net.minecraft.tags.TagKey<Block> tag, int height) {
		for (int dy = 0; dy <= height; dy++) {
			if (level.getBlockState(surface.above(dy)).is(tag)) {
				return true;
			}
		}
		return false;
	}

	private static String biomeId(ServerLevel level, BlockPos position) {
		Holder<Biome> biome = level.getBiome(position);
		return biome.unwrapKey()
				.map(key -> key.identifier().toString())
				.orElseGet(biome::getRegisteredName);
	}

	private static JsonObject countsJson(Map<String, Integer> counts) {
		JsonObject json = new JsonObject();
		for (Map.Entry<String, Integer> entry : counts.entrySet()) {
			json.addProperty(entry.getKey(), entry.getValue());
		}
		return json;
	}

	private static boolean matchesReplace(BlockState previous, String replace) {
		if (!replace.contains("[")) {
			return blockId(previous).equals(resourceId(replace, "replace"));
		}
		return previous.equals(blockStateFromString(replace, "replace"));
	}

	private static BlockState blockStateFromString(String value, String name) {
		String blockId = value;
		String properties = "";
		int propertiesStart = value.indexOf('[');
		if (propertiesStart >= 0) {
			if (!value.endsWith("]")) {
				throw new IllegalArgumentException(name + " block state must end with ]");
			}
			blockId = value.substring(0, propertiesStart);
			properties = value.substring(propertiesStart + 1, value.length() - 1);
		}

		String checked = resourceId(blockId, name);
		Block block = BuiltInRegistries.BLOCK.getOptional(Identifier.parse(checked))
				.orElseThrow(() -> new IllegalArgumentException("unknown block: " + checked));
		return applyProperties(block.defaultBlockState(), properties, name);
	}

	private static String blockId(BlockState state) {
		return BuiltInRegistries.BLOCK.getKey(state.getBlock()).toString();
	}

	private static BlockState applyProperties(BlockState state, String properties, String name) {
		if (properties.isBlank()) {
			return state;
		}

		for (String assignment : properties.split(",")) {
			String[] parts = assignment.split("=", 2);
			if (parts.length != 2 || parts[0].isBlank() || parts[1].isBlank()) {
				throw new IllegalArgumentException(name + " block state properties must be key=value pairs");
			}
			Property<?> property = state.getBlock().getStateDefinition().getProperty(parts[0]);
			if (property == null) {
				throw new IllegalArgumentException("unknown block state property " + parts[0] + " for " + blockId(state));
			}
			state = setProperty(state, property, parts[1]);
		}
		return state;
	}

	private static <T extends Comparable<T>> BlockState setProperty(BlockState state, Property<T> property, String value) {
		Optional<T> parsed = property.getValue(value);
		if (parsed.isEmpty()) {
			throw new IllegalArgumentException("invalid value " + value + " for block state property " + property.getName());
		}
		return state.setValue(property, parsed.get());
	}

	private static String blockStateId(BlockState state) {
		StringBuilder builder = new StringBuilder(blockId(state));
		if (!state.getProperties().isEmpty()) {
			builder.append('[');
			boolean first = true;
			for (Property<?> property : state.getProperties()) {
				if (!first) {
					builder.append(',');
				}
				first = false;
				builder.append(property.getName()).append('=').append(propertyValueName(state, property));
			}
			builder.append(']');
		}
		return builder.toString();
	}

	private static <T extends Comparable<T>> String propertyValueName(BlockState state, Property<T> property) {
		return property.getName(state.getValue(property));
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

	private static int optionalRawInt(JsonObject object, String name, int fallback) {
		if (!object.has(name) || object.get(name).isJsonNull()) {
			return fallback;
		}
		return object.get(name).getAsInt();
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

	private static Direction direction(String value) {
		Direction direction = Direction.byName(value);
		if (direction == null) {
			throw new IllegalArgumentException("face must be one of down, up, north, south, west, east");
		}
		return direction;
	}

	private static String resourceId(String value, String name) {
		if (!RESOURCE_ID.matcher(value).matches()) {
			throw new IllegalArgumentException(name + " must be a namespaced id like minecraft:stone");
		}
		return value;
	}
}
