package dev.alicon.mushroomyorkie.entity;

import net.minecraft.server.level.ServerLevel;

final class MushroomYorkieServerAi {
	private MushroomYorkieServerAi() {
	}

	static void tick(MushroomYorkieEntity yorkie, ServerLevel level) {
		MushroomSittingPose.preventWaterSitting(yorkie);
		MushroomFlightController.followFlyingOwner(yorkie);
		yorkie.creativeRecoveryFlight.tick();
		MushroomOwnerContactHandler.tick(yorkie, level);
		MushroomNightBehavior.tick(yorkie, level);
		MushroomOwnerPromptHandler.tick(yorkie, level);
		MushroomDarknessPanicHandler.tick(yorkie, level);
		MushroomNeedDecayHandler.tick(yorkie, level);
		MushroomReliefHandler.tick(yorkie, level);
		MushroomBehaviorDebugger.baseline(yorkie, level);
		if (yorkie.scaredRunTicks > 0) {
			yorkie.scaredRunTicks--;
		}
	}
}
