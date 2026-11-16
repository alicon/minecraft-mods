package dev.alicon.playtestbridge;

import com.google.gson.JsonObject;
import java.util.concurrent.CompletableFuture;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.world.level.storage.LevelResource;

/** Requests Minecraft's ordinary respawn packet; never edits health or server death state. */
final class BridgeClientRespawn {
	private LocalPlayer requestedPlayer;

	void register(Minecraft client, BridgeInputController inputs) {
		BridgeClientHooks.registerRespawnProvider(request -> {
			CompletableFuture<JsonObject> future = new CompletableFuture<>();
			client.execute(() -> {
				try {
					if (future.isCancelled()) return;
					var server = client.getSingleplayerServer();
					LocalPlayer player = client.player;
					if (server == null || server.getPlayerCount() != 1 || player == null || client.level == null
							|| !request.expectedSave().equals(server.getWorldPath(LevelResource.ROOT).toAbsolutePath().normalize().getFileName().toString())
							|| !request.playerUuid().equals(player.getUUID().toString())
							|| !request.dimension().equals(player.level().dimension().toString())) {
						throw new IllegalStateException("loaded client context changed before respawn");
					}
					if (!player.isDeadOrDying()) throw new IllegalStateException("respawn requires a dead client player");
					if (server.isHardcore()) throw new IllegalStateException("native fixture recovery refuses hardcore worlds");
					if (inputs.isActive()) throw new IllegalStateException("client input is still active");
					if (this.requestedPlayer == player) throw new IllegalStateException("native respawn is already requested");
					player.respawn();
					this.requestedPlayer = player;
					JsonObject reply = new JsonObject();
					reply.addProperty("ok", true);
					reply.addProperty("accepted", true);
					reply.addProperty("expectedSave", request.expectedSave());
					reply.addProperty("playerUuid", request.playerUuid());
					future.complete(reply);
				} catch (RuntimeException failure) {
					future.completeExceptionally(failure);
				}
			});
			return future;
		});
	}
}
