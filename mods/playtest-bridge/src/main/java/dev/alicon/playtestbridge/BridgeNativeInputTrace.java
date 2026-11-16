package dev.alicon.playtestbridge;

import com.google.gson.JsonObject;
import java.util.concurrent.TimeUnit;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.player.Input;

/** Passive mixin hooks for the original test owner's packet handling and riding ticks. */
public final class BridgeNativeInputTrace {
	private static final BridgeInputTimeline TIMELINE = new BridgeInputTimeline();

	private BridgeNativeInputTrace() {
	}

	static void arm(MinecraftServer server, BridgeInputRequest request) {
		TIMELINE.arm(server, request.expectedSave(), request.playerUuid(), now());
	}

	static JsonObject snapshot(MinecraftServer server, BridgeInputRequest request, long since) {
		if (!server.isSameThread()) throw new IllegalStateException("native input trace snapshots require the server thread");
		return TIMELINE.snapshot(server, request.expectedSave(), request.playerUuid(), since, now());
	}

	static void clear(MinecraftServer server) {
		TIMELINE.clear(server);
	}

	/** Records native input after its server handler returns; does not change its flags. */
	public static void packetHandled(ServerPlayer player, Input input) {
		observe(player, "input_packet", input);
	}

	/** Records the state immediately before native riding logic reads the Shift flag. */
	public static void beforeRideTick(ServerPlayer player) {
		observe(player, "ride_tick_start", null);
	}

	/** Records native riding logic's result, including any ordinary dismount. */
	public static void afterRideTick(ServerPlayer player) {
		observe(player, "ride_tick_end", null);
	}

	private static void observe(ServerPlayer player, String kind, Input input) {
		MinecraftServer server = player.level().getServer();String owner = player.getUUID().toString();
		try {
			long time = now();
			if (!TIMELINE.accepts(server, owner, time)) return;
			JsonObject event = new JsonObject();event.addProperty("kind", kind);
			event.addProperty("worldGameTime", Long.toString(player.level().getGameTime()));
			event.addProperty("dimension", player.level().dimension().toString());
			event.addProperty("serverTick", server.getTickCount());
			event.addProperty("playerTick", player.tickCount);
			event.addProperty("worldFrozen", server.tickRateManager().isFrozen());
			event.addProperty("shiftKeyDown", player.isShiftKeyDown());
			event.add("lastClientInput", flags(player.getLastClientInput()));
			event.addProperty("onFoot", player.getVehicle() == null);
			if (player.getVehicle() != null) event.addProperty("vehicleUuid", player.getVehicle().getUUID().toString());
			if (input != null) event.add("packetInput", flags(input));
			TIMELINE.record(server, owner, time, event);
		} catch (RuntimeException observationFailure) {
			// Diagnostics must not prevent the native packet handler or riding tick.
			TIMELINE.fail(server, owner);
		}
	}

	private static JsonObject flags(Input input) {
		JsonObject flags = new JsonObject();flags.addProperty("shift", input.shift());flags.addProperty("jump", input.jump());
		flags.addProperty("forward", input.forward());flags.addProperty("backward", input.backward());
		flags.addProperty("left", input.left());flags.addProperty("right", input.right());flags.addProperty("sprint", input.sprint());
		return flags;
	}

	private static long now() {
		return TimeUnit.NANOSECONDS.toMillis(System.nanoTime());
	}
}
