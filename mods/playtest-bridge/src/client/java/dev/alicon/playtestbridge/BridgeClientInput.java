package dev.alicon.playtestbridge;

import com.google.gson.JsonObject;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientLifecycleEvents;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.minecraft.client.Minecraft;

/** Nonblocking client dispatch with an independent wall-time cleanup callback. */
final class BridgeClientInput {
	private BridgeClientInput() {
	}

	static void register() {
		Minecraft client = Minecraft.getInstance();
		BridgeInputController controller = new BridgeInputController(new BridgeNativeInputTarget(client),
				() -> TimeUnit.NANOSECONDS.toMillis(System.nanoTime()));
		ClientTickEvents.START_CLIENT_TICK.register(ignored -> controller.startTick());
		ClientTickEvents.END_CLIENT_TICK.register(ignored -> controller.endTick());
		ClientLifecycleEvents.CLIENT_STOPPING.register(ignored -> controller.shutdown());
		BridgeClientHooks.registerInputProvider(request -> dispatch(client, controller, request));
	}

	private static CompletableFuture<JsonObject> dispatch(Minecraft client, BridgeInputController controller, BridgeInputRequest request) {
		CompletableFuture<JsonObject> future = new CompletableFuture<>();
		client.execute(() -> {
			try {
				if (future.isCancelled()) return;
				JsonObject result = controller.request(request);
				boolean delivered = future.complete(result);
				if (request.action().equals("start")) {
					String id = request.operationId();
					if (!delivered) controller.cancel(id, "request_cancelled");
					CompletableFuture.delayedExecutor(BridgeInputController.MAX_WALL_MILLIS, TimeUnit.MILLISECONDS)
							.execute(() -> client.execute(() -> controller.cancel(id, "wall_timeout")));
				}
			} catch (RuntimeException failure) {
				future.completeExceptionally(failure);
			}
		});
		return future;
	}
}
