package dev.alicon.playtestbridge;

import com.google.gson.JsonObject;
import java.util.concurrent.CompletableFuture;

final class BridgeClientHooks {
	private static volatile ScreenshotProvider screenshotProvider;

	private BridgeClientHooks() {
	}

	static void registerScreenshotProvider(ScreenshotProvider provider) {
		screenshotProvider = provider;
	}

	static CompletableFuture<JsonObject> captureScreenshot(String name, boolean resume, boolean hideGui, boolean clearChat) {
		ScreenshotProvider provider = screenshotProvider;
		if (provider == null) {
			CompletableFuture<JsonObject> future = new CompletableFuture<>();
			future.completeExceptionally(new IllegalStateException("screenshot provider is available only in a Minecraft client"));
			return future;
		}
		return provider.captureScreenshot(name, resume, hideGui, clearChat);
	}

	@FunctionalInterface
	interface ScreenshotProvider {
		CompletableFuture<JsonObject> captureScreenshot(String name, boolean resume, boolean hideGui, boolean clearChat);
	}
}
