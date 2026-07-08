package dev.alicon.narwhaltogether.client;

import net.minecraft.resources.ResourceLocation;

final class ControlifyResourceIds {
	private ControlifyResourceIds() {
	}

	static Object id(String path) {
		return ResourceLocation.fromNamespaceAndPath("controlify", path);
	}
}
