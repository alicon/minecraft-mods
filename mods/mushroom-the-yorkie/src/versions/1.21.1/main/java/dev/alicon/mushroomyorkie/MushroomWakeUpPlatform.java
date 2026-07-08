package dev.alicon.mushroomyorkie;

import dev.alicon.mushroomyorkie.entity.ModEntities;
import dev.alicon.mushroomyorkie.entity.MushroomYorkieEntity;
import java.util.Set;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.RelativeMovement;

final class MushroomWakeUpPlatform {
	private MushroomWakeUpPlatform() {
	}

	static void teleportRecovered(MushroomYorkieEntity yorkie, ServerLevel level, ServerPlayer player, BlockPos spawnPos) {
		yorkie.teleportTo(
				level,
				spawnPos.getX() + 0.5D,
				spawnPos.getY(),
				spawnPos.getZ() + 0.5D,
				Set.<RelativeMovement>of(),
				player.getYRot(),
				0.0F
		);
	}

	static MushroomYorkieEntity createYorkie(ServerLevel level) {
		return ModEntities.MUSHROOM_YORKIE.create(level);
	}

	static void placeNewYorkie(MushroomYorkieEntity yorkie, BlockPos spawnPos, ServerPlayer player) {
		yorkie.moveTo(spawnPos.getX() + 0.5D, spawnPos.getY(), spawnPos.getZ() + 0.5D, player.getYRot(), 0.0F);
	}
}
