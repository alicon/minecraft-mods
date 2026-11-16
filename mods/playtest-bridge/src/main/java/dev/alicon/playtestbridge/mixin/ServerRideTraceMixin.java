package dev.alicon.playtestbridge.mixin;

import dev.alicon.playtestbridge.BridgeNativeInputTrace;
import net.minecraft.server.level.ServerPlayer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Brackets the native server player's riding logic with read-only observations. */
@Mixin(ServerPlayer.class)
public abstract class ServerRideTraceMixin {
	@Inject(method = "rideTick", at = @At("HEAD"))
	private void playtestBridge$beforeRide(CallbackInfo callback) {
		BridgeNativeInputTrace.beforeRideTick((ServerPlayer) (Object) this);
	}

	@Inject(method = "rideTick", at = @At("RETURN"))
	private void playtestBridge$afterRide(CallbackInfo callback) {
		BridgeNativeInputTrace.afterRideTick((ServerPlayer) (Object) this);
	}
}
