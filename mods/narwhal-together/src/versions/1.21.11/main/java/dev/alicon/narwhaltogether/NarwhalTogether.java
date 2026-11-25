package dev.alicon.narwhaltogether;

import java.util.Set;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerPlayer;

/** Fabric entrypoint with this Minecraft target’s native identifier and teleport types. */
public final class NarwhalTogether extends NarwhalEntrypoint {
	/** Creates an identifier in NARwhal's namespace. */
	public static Identifier id(String path) {
		return Identifier.fromNamespaceAndPath(MOD_ID, path);
	}

	static void teleport(ServerPlayer player, ServerPlayer target) {
		player.teleportTo(
				target.level(),
				target.getX(),
				target.getY(),
				target.getZ(),
				Set.of(),
				target.getYRot(),
				target.getXRot(),
				false
		);
	}
}
