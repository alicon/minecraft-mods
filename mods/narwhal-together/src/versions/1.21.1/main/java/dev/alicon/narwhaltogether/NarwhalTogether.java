package dev.alicon.narwhaltogether;

import java.util.Set;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.RelativeMovement;

/** Fabric entrypoint with this Minecraft target’s native identifier and teleport types. */
public final class NarwhalTogether extends NarwhalEntrypoint {
	/** Creates an identifier in NARwhal's namespace. */
	public static ResourceLocation id(String path) {
		return ResourceLocation.fromNamespaceAndPath(MOD_ID, path);
	}

	static void teleport(ServerPlayer player, ServerPlayer target) {
		player.teleportTo(
				(ServerLevel) target.level(),
				target.getX(),
				target.getY(),
				target.getZ(),
				Set.<RelativeMovement>of(),
				target.getYRot(),
				target.getXRot()
		);
	}
}
