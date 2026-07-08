package dev.alicon.mushroomyorkie;

import dev.alicon.mushroomyorkie.entity.MushroomYorkieEntity;
import java.util.Set;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.RelativeMovement;

final class MushroomOwnerTravelPlatform {
	private MushroomOwnerTravelPlatform() {
	}

	static void teleportFollowingYorkie(MushroomYorkieEntity yorkie, ServerLevel destination, ServerPlayer player) {
		yorkie.teleportTo(
				destination,
				player.getX() + 0.5D,
				player.getY(),
				player.getZ() + 0.5D,
				Set.<RelativeMovement>of(),
				player.getYRot(),
				0.0F
		);
	}
}
