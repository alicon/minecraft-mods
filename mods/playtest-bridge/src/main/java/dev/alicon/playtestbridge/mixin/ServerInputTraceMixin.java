package dev.alicon.playtestbridge.mixin;

import dev.alicon.playtestbridge.BridgeNativeInputTrace;
import net.minecraft.network.protocol.game.ServerboundPlayerInputPacket;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.network.ServerGamePacketListenerImpl;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Observes actual input handling without replacing the native handler. */
@Mixin(ServerGamePacketListenerImpl.class)
public abstract class ServerInputTraceMixin {
	/** Original connection owner; the observer never substitutes another player. */
	@Shadow public ServerPlayer player;

	@Inject(method = "handlePlayerInput", at = @At("TAIL"))
	private void playtestBridge$inputHandled(ServerboundPlayerInputPacket packet, CallbackInfo callback) {
		BridgeNativeInputTrace.packetHandled(this.player, packet.input());
	}
}
