package dev.alicon.playtestbridge.mixin;

import net.minecraft.client.MouseHandler;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Keeps the OS pointer free during opted-in keyboard-driven playtest runs. */
@Mixin(MouseHandler.class)
public abstract class FreeCursorMixin {
	@Inject(method = "grabMouse", at = @At("HEAD"), cancellable = true)
	private void playtestBridge$keepCursorFree(CallbackInfo callback) {
		if (Boolean.getBoolean("playtest.bridge.keepCursorFree")) {
			callback.cancel();
		}
	}
}
