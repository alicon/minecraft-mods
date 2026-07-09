package dev.alicon.playtestbridge;

import com.google.gson.JsonObject;
import java.io.File;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;
import net.fabricmc.api.ClientModInitializer;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;

/** Client entrypoint that exposes local screenshot capture to the playtest bridge. */
public final class PlaytestBridgeClient implements ClientModInitializer {
	private static final Pattern SAFE_SCREENSHOT_NAME = Pattern.compile("[A-Za-z0-9._-]+\\.png");

	@Override
	public void onInitializeClient() {
		BridgeClientHooks.registerScreenshotProvider(this::captureScreenshot);
		PlaytestBridge.LOGGER.info("Playtest bridge client screenshot hook initialized");
	}

	private CompletableFuture<JsonObject> captureScreenshot(String name, boolean resume, boolean hideGui, boolean clearChat) {
		CompletableFuture<JsonObject> future = new CompletableFuture<>();
		Minecraft client = Minecraft.getInstance();
		client.execute(() -> {
			try {
				if (client.level == null) {
					throw new IllegalStateException("screenshot requires a loaded client world");
				}
				if (resume && client.screen != null) {
					client.setScreen(null);
				}
				boolean previousHideGui = client.options.hideGui;
				if (hideGui) {
					client.options.hideGui = true;
				}
				if (clearChat) {
					client.gui.getChat().clearMessages(false);
				}
				long delayMillis = resume ? 250L : 0L;
				CompletableFuture.delayedExecutor(delayMillis, TimeUnit.MILLISECONDS)
						.execute(() -> client.execute(() -> grabScreenshot(client, name, resume, hideGui, clearChat, previousHideGui, future)));
			} catch (Exception exception) {
				future.completeExceptionally(exception);
			}
		});
		return future;
	}

	private void grabScreenshot(Minecraft client, String name, boolean resumed, boolean hideGui, boolean clearChat, boolean previousHideGui, CompletableFuture<JsonObject> future) {
		try {
			String fileName = screenshotName(name);
			File screenshot = new File(new File(client.gameDirectory, Screenshot.SCREENSHOT_DIR), fileName);
			Screenshot.grab(client.gameDirectory, fileName, client.getMainRenderTarget(), 1, message -> {
				if (hideGui) {
					client.options.hideGui = previousHideGui;
				}
				JsonObject response = new JsonObject();
				response.addProperty("ok", true);
				response.addProperty("file", screenshot.getAbsolutePath());
				response.addProperty("message", message.getString());
				response.addProperty("resumed", resumed);
				response.addProperty("hideGui", hideGui);
				response.addProperty("clearChat", clearChat);
				future.complete(response);
			});
		} catch (Exception exception) {
			if (hideGui) {
				client.options.hideGui = previousHideGui;
			}
			future.completeExceptionally(exception);
		}
	}

	private String screenshotName(String requested) {
		String fileName = requested == null || requested.isBlank()
				? "playtest-bridge-" + System.currentTimeMillis() + ".png"
				: requested.trim();
		if (!fileName.endsWith(".png")) {
			fileName = fileName + ".png";
		}
		if (!SAFE_SCREENSHOT_NAME.matcher(fileName).matches()) {
			throw new IllegalArgumentException("screenshot name may contain only letters, numbers, dots, dashes, and underscores");
		}
		return fileName;
	}
}
