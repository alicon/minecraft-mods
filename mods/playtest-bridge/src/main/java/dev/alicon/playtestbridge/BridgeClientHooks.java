package dev.alicon.playtestbridge;

import com.google.gson.JsonObject;
import java.util.concurrent.CompletableFuture;

final class BridgeClientHooks {
	private static volatile ScreenshotProvider screenshotProvider;
	private static volatile QuitProvider quitProvider;
	private static volatile InputProvider inputProvider;

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

	static void registerQuitProvider(QuitProvider provider) {
		quitProvider = provider;
	}

	static CompletableFuture<JsonObject> requestQuit(String expectedSave) {
		QuitProvider provider = quitProvider;
		if (provider == null) {
			return CompletableFuture.failedFuture(new IllegalStateException("quit provider is available only in a Minecraft client"));
		}
		return provider.quit(expectedSave);
	}

	static void registerInputProvider(InputProvider provider) {
		inputProvider = provider;
	}

	static CompletableFuture<JsonObject> input(BridgeInputRequest request) {
		InputProvider provider = inputProvider;
		return provider == null
				? CompletableFuture.failedFuture(new IllegalStateException("input provider requires a Minecraft client"))
				: provider.input(request);
	}

	@FunctionalInterface
	interface InputProvider {
		CompletableFuture<JsonObject> input(BridgeInputRequest request);
	}

	@FunctionalInterface
	interface QuitProvider {
		CompletableFuture<JsonObject> quit(String expectedSave);
	}

	@FunctionalInterface
	interface ScreenshotProvider {
		CompletableFuture<JsonObject> captureScreenshot(String name, boolean resume, boolean hideGui, boolean clearChat);
	}
}
