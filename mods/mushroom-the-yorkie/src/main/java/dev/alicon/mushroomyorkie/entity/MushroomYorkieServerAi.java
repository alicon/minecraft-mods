package dev.alicon.mushroomyorkie.entity;

import net.minecraft.server.level.ServerLevel;

final class MushroomYorkieServerAi {
	private MushroomYorkieServerAi() {
	}

	static void tick(MushroomYorkieEntity yorkie, ServerLevel level) {
		MushroomSittingPose.preventWaterRest(yorkie);
		MushroomTrailFollowingGoal.warnOnLead(yorkie, level);
		MushroomFlightController.followFlyingOwner(yorkie);
		yorkie.waterEscape.tick();
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
