package dev.alicon.copsrobbers.entity;

final class PoliceCruiserServerTick {
	private PoliceCruiserServerTick() {
	}

	static void tick(PoliceCruiserEntity cruiser) {
		PoliceCruiserRuntimeState.refreshServerState(cruiser);
		PoliceCruiserFlightController.tickCreativeFlightLift(cruiser);
		PoliceCruiserAudio.playDrivenEngineSound(cruiser);
		PoliceCruiserFlightController.tickTrick(cruiser);
		PoliceCruiserImpactHandler.handleFrontImpact(cruiser);
		cruiser.tickJobHandlers();
		if (cruiser.sirenEnabled() && cruiser.isVehicle() && cruiser.tickCount % 8 == 0) {
			PoliceCruiserAudio.playSirenPulse(cruiser);
		}
	}
}
