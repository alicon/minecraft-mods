package dev.alicon.mushroomyorkie.entity;

import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.animal.wolf.WolfSoundVariant;
import net.minecraft.world.entity.animal.wolf.WolfSoundVariants;

final class MushroomYorkieSounds {
	private MushroomYorkieSounds() {
	}

	static void playTreatPickup(MushroomYorkieEntity yorkie) {
		yorkie.playSound(SoundEvents.EXPERIENCE_ORB_PICKUP, 0.5F, 1.6F);
	}

	static void playTreatTrick(MushroomYorkieEntity yorkie) {
		int trick = yorkie.getRandom().nextInt(4);
		switch (trick) {
			case 0 -> yorkie.playSound(cuteWolfSounds().pantSound().value(), 0.45F, 1.45F);
			case 1 -> yorkie.playSound(cuteWolfSounds().pantSound().value(), 0.5F, 1.45F);
			case 2 -> yorkie.setDeltaMovement(yorkie.getDeltaMovement().add(0.0D, 0.28D, 0.0D));
			default -> yorkie.playSound(cuteWolfSounds().growlSound().value(), 0.45F, 1.55F);
		}

		if (yorkie.level() instanceof ServerLevel serverLevel) {
			serverLevel.sendParticles(ParticleTypes.HEART, yorkie.getX(), yorkie.getY() + 0.5D, yorkie.getZ(), 4, 0.25D, 0.2D, 0.25D, 0.0D);
		}
	}

	static void playSleepWake(MushroomYorkieEntity yorkie) {
		yorkie.playSound(cuteWolfSounds().pantSound().value(), 0.35F, 1.45F);
	}

	static void bark(MushroomYorkieEntity yorkie) {
		yorkie.playSound(cuteWolfSounds().ambientSound().value(), 0.5F, 1.45F);
	}

	static void whine(MushroomYorkieEntity yorkie) {
		yorkie.playSound(cuteWolfSounds().whineSound().value(), 0.55F, 1.45F);
	}

	static void playScoldedWhine(MushroomYorkieEntity yorkie) {
		yorkie.playSound(cuteWolfSounds().whineSound().value(), 0.7F, 1.45F);
	}

	static void playHostileGrowl(MushroomYorkieEntity yorkie) {
		yorkie.playSound(cuteWolfSounds().growlSound().value(), 0.45F, 1.6F);
	}

	static void playFoodSound(MushroomYorkieEntity yorkie) {
		yorkie.playSound(SoundEvents.GENERIC_EAT.value(), 0.45F, 1.45F);
	}

	static SoundEvent hurtSound(DamageSource damageSource) {
		return cuteWolfSounds().hurtSound().value();
	}

	static SoundEvent deathSound() {
		return cuteWolfSounds().deathSound().value();
	}

	private static WolfSoundVariant cuteWolfSounds() {
		return SoundEvents.WOLF_SOUNDS.get(WolfSoundVariants.SoundSet.CUTE);
	}
}
