package dev.alicon.mushroomyorkie.entity;

import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;

final class StructureScentCelebration {
	private StructureScentCelebration() {
	}

	static int tick(ServerLevel level, MushroomYorkieEntity yorkie, int ticksRemaining) {
		ticksRemaining--;
		yorkie.getNavigation().stop();
		yorkie.setYRot(yorkie.getYRot() + 22.5F);
		yorkie.yBodyRot = yorkie.getYRot();
		yorkie.yHeadRot = yorkie.getYRot();
		yorkie.yRotO = yorkie.getYRot();
		if (ticksRemaining % 12 == 0) {
			MushroomYorkieSounds.bark(yorkie);
			yorkie.setDeltaMovement(yorkie.getDeltaMovement().add(0.0D, 0.16D, 0.0D));
			level.sendParticles(ParticleTypes.HEART, yorkie.getX(), yorkie.getY() + 0.5D, yorkie.getZ(), 3, 0.2D, 0.15D, 0.2D, 0.0D);
		}
		return ticksRemaining;
	}
}
