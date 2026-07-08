package dev.alicon.narwhaltogether.client;

import net.minecraft.resources.Identifier;

final class ControlifyResourceIds {
	private ControlifyResourceIds() {
	}

	static Object id(String path) {
		return Identifier.fromNamespaceAndPath("controlify", path);
	}
}
