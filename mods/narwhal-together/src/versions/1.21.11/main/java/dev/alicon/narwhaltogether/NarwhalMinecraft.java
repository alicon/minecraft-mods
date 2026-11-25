package dev.alicon.narwhaltogether;

import java.util.Set;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerPlayer;

/** Resource identifiers and the teleport signature for this Minecraft target. */
public final class NarwhalMinecraft {
	private NarwhalMinecraft() {
	}

	/** Creates an identifier in NARwhal's namespace. */
	public static Identifier id(String path) {
		return Identifier.fromNamespaceAndPath(NarwhalTogether.MOD_ID, path);
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
