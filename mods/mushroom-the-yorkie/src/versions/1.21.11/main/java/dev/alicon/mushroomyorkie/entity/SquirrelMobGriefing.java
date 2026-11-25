package dev.alicon.mushroomyorkie.entity;

import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.gamerules.GameRules;

final class SquirrelMobGriefing {
	private SquirrelMobGriefing() {
	}

	static boolean canPlant(ServerLevel level) {
		return level.getGameRules().get(GameRules.MOB_GRIEFING);
	}
}
