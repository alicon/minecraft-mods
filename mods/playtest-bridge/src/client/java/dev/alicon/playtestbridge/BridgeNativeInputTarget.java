package dev.alicon.playtestbridge;

import com.google.gson.JsonObject;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.KeyboardInput;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.server.MinecraftServer;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.player.Input;
import net.minecraft.world.entity.vehicle.boat.AbstractBoat;
import net.minecraft.world.level.storage.LevelResource;
import net.minecraft.world.phys.Vec3;

/** Applies key mappings before KeyboardInput runs; never writes velocity or vehicle motion. */
final class BridgeNativeInputTarget implements BridgeInputController.Target {
	private final Minecraft client;
	private LocalPlayer player;
	private MinecraftServer server;
	private Entity vehicle;
	private String dimension;
	private BridgeInputRequest request;

	BridgeNativeInputTarget(Minecraft client) {
		this.client = client;
	}

	@Override
	public void bind(BridgeInputRequest request) {
		this.request = request;
		this.player = this.client.player;
		this.server = this.client.getSingleplayerServer();
		this.vehicle = this.player == null ? null : this.player.getVehicle();
		this.dimension = this.player == null ? "" : this.player.level().dimension().toString();
		String invalid = this.invalidContext();
		if (invalid != null) throw new IllegalStateException("client input refused: " + invalid);
		if (!(this.player.input instanceof KeyboardInput)) throw new IllegalStateException("client input requires native KeyboardInput");
		var keys = this.client.options;
		if (keys.keyUp.isDown() || keys.keyDown.isDown() || keys.keyLeft.isDown() || keys.keyRight.isDown()
				|| keys.keyJump.isDown() || keys.keyShift.isDown() || keys.keySprint.isDown()) {
			throw new IllegalStateException("release physical movement controls before starting client input");
		}
	}

	@Override
	public String invalidContext() {
		if (this.server == null || this.client.getSingleplayerServer() != this.server
				|| !this.request.expectedSave().equals(this.server.getWorldPath(LevelResource.ROOT)
						.toAbsolutePath().normalize().getFileName().toString())) return "save_changed";
		if (this.player == null || this.client.player != this.player || !this.player.isAlive()
				|| !this.request.playerUuid().equals(this.player.getUUID().toString())
				|| this.server.getPlayerCount() != 1) return "player_changed";
		if (!this.dimension.equals(this.player.level().dimension().toString())) return "dimension_changed";
		if (this.client.screen != null) return "screen_open";
		if (this.client.level == null || this.client.level.tickRateManager().isFrozen()) return "world_frozen";
		if (!(this.player.input instanceof KeyboardInput)) return "input_source_changed";
		if (this.player.isSpectator() || this.player.getAbilities().flying) return "unsupported_player_mode";
		var keys = this.client.options;
		if (keys.keyJump.isDown() || keys.keyShift.isDown() || keys.keySprint.isDown()) return "external_movement_input";
		if (this.player.getVehicle() != this.vehicle) return "vehicle_changed";
		if (this.request.mode().equals("boat")) {
			if (!(this.vehicle instanceof AbstractBoat boat) || !boat.isAlive()
					|| !this.request.vehicleUuid().equals(boat.getUUID().toString())
					|| boat.getControllingPassenger() != this.player) return "not_boat_driver";
		} else if (this.vehicle != null) return "walking_requires_no_vehicle";
		return null;
	}

	@Override
	public void apply(BridgeInputRequest request) {
		var keys = this.client.options;
		keys.keyUp.setDown(request.forward());
		keys.keyDown.setDown(request.backward());
		keys.keyLeft.setDown(request.left());
		keys.keyRight.setDown(request.right());
	}

	@Override
	public void release() {
		var keys = this.client.options;
		keys.keyUp.setDown(false);
		keys.keyDown.setDown(false);
		keys.keyLeft.setDown(false);
		keys.keyRight.setDown(false);
		// Clear the captured player's cached input as well; that object may no
		// longer tick after a disconnect, death or dimension transition.
		if (this.player != null && this.player.input != null) this.player.input.keyPresses = Input.EMPTY;
	}

	@Override
	public boolean neutral() {
		var keys = this.client.options;
		if (keys.keyUp.isDown() || keys.keyDown.isDown() || keys.keyLeft.isDown() || keys.keyRight.isDown()) return false;
		if (this.player == null || this.player.input == null) return true;
		Input input = this.player.input.keyPresses;
		return !input.forward() && !input.backward() && !input.left() && !input.right();
	}

	@Override
	public JsonObject sample() {
		JsonObject frame = new JsonObject();
		frame.addProperty("clientWorldGameTime", Long.toString(this.player.level().getGameTime()));
		frame.add("clientPlayerPosition", position(this.player.position()));
		frame.addProperty("clientPlayerYaw", this.player.getYRot());
		Input input = this.player.input.keyPresses;
		JsonObject buttons = new JsonObject();
		buttons.addProperty("forward", input.forward());
		buttons.addProperty("backward", input.backward());
		buttons.addProperty("left", input.left());
		buttons.addProperty("right", input.right());
		frame.add("nativeInput", buttons);
		if (this.vehicle != null) {
			frame.addProperty("vehicleUuid", this.vehicle.getUUID().toString());
			frame.add("clientVehiclePosition", position(this.vehicle.position()));
			frame.addProperty("clientVehicleYaw", this.vehicle.getYRot());
			if (this.vehicle instanceof AbstractBoat boat) {
				frame.addProperty("paddleLeft", boat.getPaddleState(0));
				frame.addProperty("paddleRight", boat.getPaddleState(1));
			}
		}
		return frame;
	}

	private static JsonObject position(Vec3 position) {
		JsonObject result = new JsonObject();
		result.addProperty("x", position.x);
		result.addProperty("y", position.y);
		result.addProperty("z", position.z);
		return result;
	}
}
