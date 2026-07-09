package dev.alicon.playtestbridge;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;
import net.minecraft.commands.CommandResultCallback;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.Component;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.permissions.PermissionSet;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.level.storage.LevelResource;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;

final class PlaytestBridgeServer {
	private static final Gson GSON = new Gson();
	private static final int SERVER_TASK_TIMEOUT_SECONDS = 15;
	private static final double DEFAULT_LOOK_DISTANCE = 8.0D;
	private static final double MAX_LOOK_DISTANCE = 64.0D;
	private static final Pattern RESOURCE_ID = Pattern.compile("[a-z0-9_.-]+:[a-z0-9_./-]+");
	private final MinecraftServer server;
	private final int port;
	private HttpServer httpServer;
	private ExecutorService executor;

	PlaytestBridgeServer(MinecraftServer server, int port) {
		this.server = server;
		this.port = port;
	}

	void start() {
		try {
			InetSocketAddress address = new InetSocketAddress(InetAddress.getLoopbackAddress(), this.port);
			this.executor = Executors.newSingleThreadExecutor(runnable -> {
				Thread thread = new Thread(runnable, "playtest-bridge-http");
				thread.setDaemon(true);
				return thread;
			});
			this.httpServer = HttpServer.create(address, 0);
			this.httpServer.createContext("/", this::route);
			this.httpServer.setExecutor(this.executor);
			this.httpServer.start();
			PlaytestBridge.LOGGER.info("Playtest bridge listening at http://127.0.0.1:{}", this.port);
		} catch (IOException exception) {
			PlaytestBridge.LOGGER.error("Failed to start playtest bridge on loopback port {}", this.port, exception);
		}
	}

	void stop() {
		if (this.httpServer != null) {
			this.httpServer.stop(0);
			this.httpServer = null;
		}
		if (this.executor != null) {
			this.executor.shutdownNow();
			this.executor = null;
		}
		PlaytestBridge.LOGGER.info("Playtest bridge stopped");
	}

	private void route(HttpExchange exchange) throws IOException {
		try {
			if (!exchange.getRemoteAddress().getAddress().isLoopbackAddress()) {
				sendError(exchange, 403, "Playtest bridge accepts loopback requests only");
				return;
			}

			String method = exchange.getRequestMethod();
			String path = exchange.getRequestURI().getPath();
			if ("GET".equals(method) && "/health".equals(path)) {
				sendJson(exchange, 200, this.health());
			} else if ("GET".equals(method) && "/state".equals(path)) {
				sendJson(exchange, 200, runOnServerThread(this::state));
			} else if ("POST".equals(method) && "/chat".equals(path)) {
				JsonObject body = readBody(exchange);
				sendJson(exchange, 200, runOnServerThread(() -> this.chat(body)));
			} else if ("POST".equals(method) && "/command".equals(path)) {
				JsonObject body = readBody(exchange);
				sendJson(exchange, 200, runOnServerThread(() -> this.command(body)));
			} else if ("POST".equals(method) && "/look".equals(path)) {
				JsonObject body = readBody(exchange);
				sendJson(exchange, 200, runOnServerThread(() -> this.look(body)));
			} else if ("POST".equals(method) && "/give".equals(path)) {
				JsonObject body = readBody(exchange);
				sendJson(exchange, 200, runOnServerThread(() -> this.give(body)));
			} else if ("POST".equals(method) && "/summon".equals(path)) {
				JsonObject body = readBody(exchange);
				sendJson(exchange, 200, runOnServerThread(() -> this.summon(body)));
			} else if ("POST".equals(method) && "/teleport".equals(path)) {
				JsonObject body = readBody(exchange);
				sendJson(exchange, 200, runOnServerThread(() -> this.teleport(body)));
			} else if ("POST".equals(method) && "/player-abilities".equals(path)) {
				JsonObject body = readBody(exchange);
				sendJson(exchange, 200, runOnServerThread(() -> BridgePlayerActions.updateAbilities(this.playerFromBody(body), body)));
			} else if ("POST".equals(method) && "/use-entity".equals(path)) {
				JsonObject body = readBody(exchange);
				sendJson(exchange, 200, runOnServerThread(() -> this.useEntity(body)));
			} else if ("POST".equals(method) && "/clear-entities".equals(path)) {
				JsonObject body = readBody(exchange);
				sendJson(exchange, 200, runOnServerThread(() -> BridgeEntityActions.clearEntities(this.server, body)));
			} else if ("POST".equals(method) && "/set-block-near-entity".equals(path)) {
				JsonObject body = readBody(exchange);
				sendJson(exchange, 200, runOnServerThread(() -> this.setBlockNearEntity(body)));
			} else if ("POST".equals(method) && "/set-block".equals(path)) {
				JsonObject body = readBody(exchange);
				sendJson(exchange, 200, runOnServerThread(() -> this.setBlock(body)));
			} else if ("POST".equals(method) && "/block".equals(path)) {
				JsonObject body = readBody(exchange);
				sendJson(exchange, 200, runOnServerThread(() -> this.block(body)));
			} else if ("POST".equals(method) && "/use-block".equals(path)) {
				JsonObject body = readBody(exchange);
				sendJson(exchange, 200, runOnServerThread(() -> BridgeWorldActions.useBlock(this.playerFromBody(body), body)));
			} else if ("POST".equals(method) && "/count-blocks".equals(path)) {
				JsonObject body = readBody(exchange);
				sendJson(exchange, 200, runOnServerThread(() -> BridgeWorldActions.countBlocks(this.playerFromBody(body), body)));
			} else if ("POST".equals(method) && "/screenshot".equals(path)) {
				JsonObject body = readBody(exchange);
				sendJson(exchange, 200, this.screenshot(body));
			} else {
				sendError(exchange, 404, "Unknown bridge endpoint");
			}
		} catch (Exception exception) {
			PlaytestBridge.LOGGER.warn("Playtest bridge request failed", exception);
			sendError(exchange, 500, exception.getMessage() == null ? exception.getClass().getSimpleName() : exception.getMessage());
		} finally {
			exchange.close();
		}
	}

	private JsonObject health() {
		JsonObject health = new JsonObject();
		health.addProperty("ok", true);
		health.addProperty("modId", PlaytestBridge.MOD_ID);
		health.addProperty("port", this.port);
		health.addProperty("playerCount", this.server.getPlayerCount());
		health.addProperty("singleplayer", this.server.isSingleplayer());
		return health;
	}

	private JsonObject state() {
		JsonObject state = this.health();
		state.addProperty("motd", this.server.getMotd());
		state.addProperty("tickCount", this.server.getTickCount());
		Path savePath = this.server.getWorldPath(LevelResource.ROOT).toAbsolutePath().normalize();
		state.addProperty("savePath", savePath.toString());
		Path saveName = savePath.getFileName();
		if (saveName != null) {
			state.addProperty("saveName", saveName.toString());
		}

		JsonArray players = new JsonArray();
		for (ServerPlayer player : this.server.getPlayerList().getPlayers()) {
			players.add(BridgeEntityState.playerState(player));
		}
		state.add("players", players);
		return state;
	}

	private JsonObject chat(JsonObject body) {
		String message = requiredString(body, "message");
		this.server.getPlayerList().broadcastSystemMessage(Component.literal("[Bridge] " + message), false);
		JsonObject response = new JsonObject();
		response.addProperty("ok", true);
		response.addProperty("message", message);
		return response;
	}

	private JsonObject command(JsonObject body) {
		String command = requiredString(body, "command").trim();
		if (command.startsWith("/")) {
			command = command.substring(1);
		}
		if (command.isBlank()) {
			throw new IllegalArgumentException("command cannot be blank");
		}

		return runCommand(command);
	}

	private JsonObject look(JsonObject body) {
		ServerPlayer player = playerFromBody(body);
		double distance = optionalDouble(body, "distance", DEFAULT_LOOK_DISTANCE, 1.0D, MAX_LOOK_DISTANCE);
		Vec3 start = player.getEyePosition();
		Vec3 end = start.add(player.getLookAngle().scale(distance));
		ServerLevel level = (ServerLevel) player.level();

		JsonObject response = new JsonObject();
		response.addProperty("ok", true);
		response.addProperty("player", player.getGameProfile().name());
		response.addProperty("distance", distance);

		BlockHitResult blockHit = level.clip(new ClipContext(start, end, ClipContext.Block.OUTLINE, ClipContext.Fluid.NONE, player));
		if (blockHit.getType() != HitResult.Type.MISS) {
			BlockPos pos = blockHit.getBlockPos();
			JsonObject block = new JsonObject();
			block.addProperty("type", BuiltInRegistries.BLOCK.getKey(level.getBlockState(pos).getBlock()).toString());
			block.addProperty("side", blockHit.getDirection().toString());
			block.add("position", BridgeEntityState.blockPosition(pos));
			block.add("hit", BridgeEntityState.position(blockHit.getLocation()));
			response.add("block", block);
		}

		EntityHitResult entityHit = findEntityHit(player, level, start, end, distance);
		if (entityHit != null) {
			Entity entity = entityHit.getEntity();
			JsonObject hitEntity = BridgeEntityState.entityState(player, entity);
			hitEntity.add("hit", BridgeEntityState.position(entityHit.getLocation()));
			response.add("entity", hitEntity);
		}
		return response;
	}

	private JsonObject give(JsonObject body) {
		ServerPlayer player = playerFromBody(body);
		String item = resourceId(requiredString(body, "item"), "item");
		int count = optionalInt(body, "count", 1, 1, 64);
		String command = String.format(Locale.ROOT, "give %s %s %d", player.getGameProfile().name(), item, count);
		JsonObject response = runCommand(command);

		response.addProperty("player", player.getGameProfile().name());
		response.addProperty("item", item);
		response.addProperty("count", count);
		return response;
	}

	private JsonObject summon(JsonObject body) {
		ServerPlayer player = playerFromBody(body);
		String entity = resourceId(requiredString(body, "entity"), "entity");
		int count = optionalInt(body, "count", 1, 1, 16);
		JsonArray commands = new JsonArray();
		for (int index = 0; index < count; index++) {
			String command = String.format(Locale.ROOT, "execute at %s run summon %s ~ ~ ~", player.getGameProfile().name(), entity);
			runCommand(command);
			commands.add(command);
		}

		JsonObject response = new JsonObject();
		response.addProperty("ok", true);
		response.addProperty("player", player.getGameProfile().name());
		response.addProperty("entity", entity);
		response.addProperty("count", count);
		response.add("commands", commands);
		return response;
	}

	private JsonObject teleport(JsonObject body) {
		ServerPlayer player = playerFromBody(body);
		double x = requiredDouble(body, "x");
		double y = requiredDouble(body, "y");
		double z = requiredDouble(body, "z");
		String command = String.format(Locale.ROOT, "tp %s %.3f %.3f %.3f", player.getGameProfile().name(), x, y, z);
		JsonObject response = runCommand(command);

		response.addProperty("player", player.getGameProfile().name());
		response.add("position", BridgeEntityState.position(new Vec3(x, y, z)));
		return response;
	}

	private JsonObject useEntity(JsonObject body) {
		ServerPlayer player = playerFromBody(body);
		return BridgeEntityActions.useEntity(player, body);
	}

	private JsonObject setBlockNearEntity(JsonObject body) {
		ServerPlayer player = playerFromBody(body);
		return BridgeWorldActions.setBlockNearEntity(player, body);
	}

	private JsonObject setBlock(JsonObject body) {
		ServerPlayer player = playerFromBody(body);
		return BridgeWorldActions.setBlock(player, body);
	}

	private JsonObject block(JsonObject body) {
		ServerPlayer player = playerFromBody(body);
		return BridgeWorldActions.block(player, body);
	}

	private JsonObject screenshot(JsonObject body) throws Exception {
		String name = optionalString(body, "name", "");
		boolean resume = optionalBoolean(body, "resume", true);
		boolean hideGui = optionalBoolean(body, "hideGui", false);
		boolean clearChat = optionalBoolean(body, "clearChat", false);
		return BridgeClientHooks.captureScreenshot(name, resume, hideGui, clearChat).get(SERVER_TASK_TIMEOUT_SECONDS, TimeUnit.SECONDS);
	}

	private EntityHitResult findEntityHit(ServerPlayer player, ServerLevel level, Vec3 start, Vec3 end, double distance) {
		AABB area = player.getBoundingBox().expandTowards(player.getLookAngle().scale(distance)).inflate(1.0D);
		Entity closestEntity = null;
		Vec3 closestHit = null;
		double closestDistance = distance * distance;
		for (Entity entity : level.getEntities(player, area, entity -> entity.isAlive())) {
			Optional<Vec3> hit = entity.getBoundingBox().inflate(0.3D).clip(start, end);
			if (hit.isEmpty()) {
				continue;
			}

			double hitDistance = start.distanceToSqr(hit.get());
			if (hitDistance < closestDistance) {
				closestEntity = entity;
				closestHit = hit.get();
				closestDistance = hitDistance;
			}
		}
		return closestEntity == null ? null : new EntityHitResult(closestEntity, closestHit);
	}

	private JsonObject readBody(HttpExchange exchange) throws IOException {
		try (InputStreamReader reader = new InputStreamReader(exchange.getRequestBody(), StandardCharsets.UTF_8)) {
			return JsonParser.parseReader(reader).getAsJsonObject();
		}
	}

	private String requiredString(JsonObject object, String name) {
		if (!object.has(name) || !object.get(name).isJsonPrimitive()) {
			throw new IllegalArgumentException("missing string field: " + name);
		}
		String value = object.get(name).getAsString();
		if (value.isBlank()) {
			throw new IllegalArgumentException(name + " cannot be blank");
		}
		return value;
	}

	private ServerPlayer playerFromBody(JsonObject object) {
		String requested = optionalString(object, "player", "");
		if (requested.isBlank()) {
			List<ServerPlayer> players = this.server.getPlayerList().getPlayers();
			if (players.size() == 1) {
				return players.getFirst();
			}
			throw new IllegalArgumentException("player is required when player count is not exactly one");
		}

		for (ServerPlayer player : this.server.getPlayerList().getPlayers()) {
			if (player.getGameProfile().name().equalsIgnoreCase(requested)) {
				return player;
			}
		}
		throw new IllegalArgumentException("player not found: " + requested);
	}

	private String optionalString(JsonObject object, String name, String fallback) {
		if (!object.has(name) || object.get(name).isJsonNull()) {
			return fallback;
		}
		return object.get(name).getAsString();
	}

	private int optionalInt(JsonObject object, String name, int fallback, int min, int max) {
		if (!object.has(name) || object.get(name).isJsonNull()) {
			return fallback;
		}
		int value = object.get(name).getAsInt();
		if (value < min || value > max) {
			throw new IllegalArgumentException(name + " must be between " + min + " and " + max);
		}
		return value;
	}

	private double optionalDouble(JsonObject object, String name, double fallback, double min, double max) {
		if (!object.has(name) || object.get(name).isJsonNull()) {
			return fallback;
		}
		double value = object.get(name).getAsDouble();
		if (!Double.isFinite(value) || value < min || value > max) {
			throw new IllegalArgumentException(name + " must be between " + min + " and " + max);
		}
		return value;
	}

	private boolean optionalBoolean(JsonObject object, String name, boolean fallback) {
		if (!object.has(name) || object.get(name).isJsonNull()) {
			return fallback;
		}
		String value = object.get(name).getAsString().toLowerCase(Locale.ROOT);
		return switch (value) {
			case "1", "true", "yes", "on" -> true;
			case "0", "false", "no", "off" -> false;
			default -> throw new IllegalArgumentException(name + " must be true or false");
		};
	}

	private double requiredDouble(JsonObject object, String name) {
		if (!object.has(name) || object.get(name).isJsonNull()) {
			throw new IllegalArgumentException("missing number field: " + name);
		}
		double value = object.get(name).getAsDouble();
		if (!Double.isFinite(value)) {
			throw new IllegalArgumentException(name + " must be finite");
		}
		return value;
	}

	private String resourceId(String value, String name) {
		if (!RESOURCE_ID.matcher(value).matches()) {
			throw new IllegalArgumentException(name + " must be a namespaced id like minecraft:pig");
		}
		return value;
	}

	private JsonObject commandResponse(String command) {
		JsonObject response = new JsonObject();
		response.addProperty("ok", true);
		response.addProperty("command", command);
		response.addProperty("executed", true);
		return response;
	}

	private JsonObject runCommand(String command) {
		CommandResult result = new CommandResult();
		CommandResultCallback callback = (success, value) -> {
			result.callbackSeen = true;
			result.success = success;
			result.result = value;
		};
		CommandSourceStack source = this.server.createCommandSourceStack()
				.withPermission(PermissionSet.ALL_PERMISSIONS)
				.withCallback(callback);
		this.server.getCommands().performPrefixedCommand(source, "/" + command);

		JsonObject response = commandResponse(command);
		response.addProperty("callbackSeen", result.callbackSeen);
		if (result.callbackSeen) {
			response.addProperty("success", result.success);
			response.addProperty("result", result.result);
		}
		return response;
	}

	private <T> T runOnServerThread(ServerTask<T> task) throws Exception {
		CompletableFuture<T> future = new CompletableFuture<>();
		this.server.execute(() -> {
			try {
				future.complete(task.run());
			} catch (Exception exception) {
				future.completeExceptionally(exception);
			}
		});
		return future.get(SERVER_TASK_TIMEOUT_SECONDS, TimeUnit.SECONDS);
	}

	private void sendJson(HttpExchange exchange, int status, JsonObject body) throws IOException {
		byte[] bytes = GSON.toJson(body).getBytes(StandardCharsets.UTF_8);
		exchange.getResponseHeaders().set("content-type", "application/json; charset=utf-8");
		exchange.sendResponseHeaders(status, bytes.length);
		try (OutputStream response = exchange.getResponseBody()) {
			response.write(bytes);
		}
	}

	private void sendError(HttpExchange exchange, int status, String message) throws IOException {
		JsonObject error = new JsonObject();
		error.addProperty("ok", false);
		error.addProperty("error", message);
		sendJson(exchange, status, error);
	}

	@FunctionalInterface
	private interface ServerTask<T> {
		T run() throws Exception;
	}

	private static final class CommandResult {
		private boolean callbackSeen;
		private boolean success;
		private int result;
	}
}
