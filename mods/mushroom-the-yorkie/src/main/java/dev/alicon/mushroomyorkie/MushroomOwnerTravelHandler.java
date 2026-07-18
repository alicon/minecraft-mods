package dev.alicon.mushroomyorkie;

import dev.alicon.mushroomyorkie.entity.MushroomYorkieEntity;
import java.util.List;
import net.fabricmc.fabric.api.entity.event.v1.ServerEntityWorldChangeEvents;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.level.entity.EntityTypeTest;

final class MushroomOwnerTravelHandler {
	private MushroomOwnerTravelHandler() {
	}

	static void register() {
		ServerEntityWorldChangeEvents.AFTER_PLAYER_CHANGE_WORLD.register(MushroomOwnerTravelHandler::afterPlayerChangeWorld);
	}

	private static void afterPlayerChangeWorld(ServerPlayer player, ServerLevel origin, ServerLevel destination) {
		for (MushroomYorkieEntity yorkie : followingYorkies(player, origin)) {
			MushroomOwnerTravelPlatform.teleportFollowingYorkie(yorkie, destination, player);
		}
	}

	private static List<? extends MushroomYorkieEntity> followingYorkies(ServerPlayer player, ServerLevel origin) {
		return origin.getEntities(
				EntityTypeTest.forClass(MushroomYorkieEntity.class),
				yorkie -> MushroomOwnerTravelPolicy.shouldFollow(
						yorkie.isAlive(),
						// The player has already left origin, so vanilla's level-local owner lookup no longer resolves here.
						yorkie.belongsTo(player),
						yorkie.isOrderedToSit()
				)
		);
	}
}
