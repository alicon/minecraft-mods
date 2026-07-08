package dev.alicon.mushroomyorkie.entity;

import java.util.UUID;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;

final class FetchToyReturner {
	private static final double RETURN_DISTANCE_SQR = 4.0D;
	private static final double RETURN_SPEED = 1.20D;
	private static final int UNREACHABLE_RETURN_TICKS = 20;

	private final MushroomYorkieEntity yorkie;
	private int unreachableTicks;

	FetchToyReturner(MushroomYorkieEntity yorkie) {
		this.yorkie = yorkie;
	}

	void reset() {
		this.unreachableTicks = 0;
	}

	FetchToyReturnResult tick(ServerLevel level, Player owner, ItemStack carriedToy, FetchToyMovement movement) {
		this.yorkie.getLookControl().setLookAt(owner, 10.0F, this.yorkie.getMaxHeadXRot());
		if (this.yorkie.distanceToSqr(owner) <= RETURN_DISTANCE_SQR) {
			ItemStack returnedStack = carriedToy.isEmpty() ? ItemStack.EMPTY : carriedToy.copyWithCount(1);
			UUID droppedToy = FetchToyDelivery.returnToy(level, this.yorkie, owner, returnedStack);
			this.yorkie.needs.playWithToy();
			MushroomYorkieSounds.bark(this.yorkie);
			MushroomBehaviorDebugger.debug(this.yorkie, "fetch_return", "fetch: brought the toy back", true);
			return new FetchToyReturnResult(true, droppedToy);
		}

		if (!this.yorkie.isNoGravity() && !this.yorkie.creativeRecoveryFlight.hasRequest()) {
			this.yorkie.creativeRecoveryFlight.block();
		}
		movement.moveToward(owner.position(), RETURN_SPEED);
		if (this.returnLooksUnreachable(owner)) {
			this.yorkie.creativeRecoveryFlight.request();
			MushroomBehaviorDebugger.debug(this.yorkie, "fetch_return_flight", "fetch: return path is stuck, using creative recovery flight", true);
		}
		return FetchToyReturnResult.IN_PROGRESS;
	}

	private boolean returnLooksUnreachable(Player owner) {
		if (MushroomYorkieStateQueries.ownerIsCreativeFlying(this.yorkie)
				|| this.yorkie.isNoGravity()
				|| !MushroomYorkieStateQueries.isWetForSitting(this.yorkie)
				|| this.yorkie.distanceToSqr(owner) <= RETURN_DISTANCE_SQR
				|| !this.yorkie.getNavigation().isDone()) {
			this.unreachableTicks = 0;
			return false;
		}

		this.unreachableTicks++;
		return this.unreachableTicks >= UNREACHABLE_RETURN_TICKS;
	}
}

record FetchToyReturnResult(boolean completed, UUID returnedToy) {
	static final FetchToyReturnResult IN_PROGRESS = new FetchToyReturnResult(false, null);
}
