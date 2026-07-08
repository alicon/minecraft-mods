package dev.alicon.mushroomyorkie.entity;

import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.monster.Monster;

final class MushroomHostileCombat {
	private MushroomHostileCombat() {
	}

	static void attack(MushroomYorkieEntity yorkie, ServerLevel level, Monster target) {
		yorkie.doHurtTarget(level, target);
		MushroomYorkieSounds.playHostileGrowl(yorkie);
	}
}
