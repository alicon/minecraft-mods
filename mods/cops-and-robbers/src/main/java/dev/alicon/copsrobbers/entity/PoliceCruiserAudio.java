package dev.alicon.copsrobbers.entity;

import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;

final class PoliceCruiserAudio {
	private PoliceCruiserAudio() {
	}

	static void playDrivenEngineSound(PoliceCruiserEntity cruiser) {
		if (!cruiser.isVehicle() || cruiser.tickCount % 9 != 0) {
			return;
		}

		float pitch = 0.75F + Math.min((float) cruiser.getDeltaMovement().length() * 0.65F, 0.45F);
		cruiser.level().playSound(null, cruiser.getX(), cruiser.getY() + 0.45D, cruiser.getZ(), SoundEvents.MINECART_RIDING, SoundSource.PLAYERS, 0.32F, pitch);
	}

	static void playSirenPulse(PoliceCruiserEntity cruiser) {
		float pitch = cruiser.tickCount % 32 < 16 ? 0.82F : 1.48F;
		cruiser.level().playSound(null, cruiser.getX(), cruiser.getY() + 1.0D, cruiser.getZ(), SoundEvents.NOTE_BLOCK_BIT.value(), SoundSource.PLAYERS, 1.05F, pitch);
		cruiser.level().playSound(null, cruiser.getX(), cruiser.getY() + 1.0D, cruiser.getZ(), SoundEvents.NOTE_BLOCK_XYLOPHONE.value(), SoundSource.PLAYERS, 0.38F, pitch * 0.74F);
	}
}
