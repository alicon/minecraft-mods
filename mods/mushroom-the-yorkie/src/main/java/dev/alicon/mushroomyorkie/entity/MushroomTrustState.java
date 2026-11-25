package dev.alicon.mushroomyorkie.entity;

import java.util.UUID;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;

final class MushroomTrustState {
	private UUID trustedPlayerUuid;
	private long scoldedDay = -1L;
	private long hitCountDay = -1L;
	private int hitsToday;

	void claim(Player player) {
		this.trustedPlayerUuid = player.getUUID();
		this.scoldedDay = -1L;
		this.hitsToday = 0;
		this.hitCountDay = -1L;
	}

	boolean belongsTo(MushroomYorkieEntity yorkie, Player player) {
		return yorkie.isOwnedBy(player) || (this.trustedPlayerUuid != null && this.trustedPlayerUuid.equals(player.getUUID()));
	}

	boolean wasScoldedToday(ServerLevel level) {
		return this.scoldedDay == MushroomNightBehavior.currentDay(level);
	}

	Player playerToStayNear(MushroomYorkieEntity yorkie, ServerLevel level) {
		Player trusted = this.trustedPlayer(yorkie, level);
		return trusted == null ? this.nearestPlayer(yorkie, level) : trusted;
	}

	boolean recordTrustedPlayerHit(ServerLevel level, Player player) {
		long day = MushroomNightBehavior.currentDay(level);
		if (this.hitCountDay != day) {
			this.hitCountDay = day;
			this.hitsToday = 0;
		}

		this.hitsToday++;
		this.trustedPlayerUuid = player.getUUID();
		if (this.hitsToday <= 1) {
			return false;
		}

		this.scoldedDay = day;
		return true;
	}

	UUID trustedPlayerUuid() {
		return this.trustedPlayerUuid;
	}

	long scoldedDay() {
		return this.scoldedDay;
	}

	void restore(UUID trustedPlayerUuid, long scoldedDay) {
		this.trustedPlayerUuid = trustedPlayerUuid;
		this.scoldedDay = scoldedDay;
	}

	private Player trustedPlayer(MushroomYorkieEntity yorkie, ServerLevel level) {
		if (this.trustedPlayerUuid != null) {
			Player player = MushroomVersionedAnimal.findPlayer(level, this.trustedPlayerUuid);
			if (player != null && player.level() == yorkie.level()) {
				return player;
			}
		}

		LivingEntity owner = yorkie.getOwner();
		if (owner instanceof Player player && player.level() == yorkie.level()) {
			return player;
		}

		return null;
	}

	private Player nearestPlayer(MushroomYorkieEntity yorkie, ServerLevel level) {
		Player closest = null;
		double closestDistance = Double.MAX_VALUE;
		for (ServerPlayer player : level.players()) {
			double distance = yorkie.distanceToSqr(player);
			if (distance < closestDistance) {
				closest = player;
				closestDistance = distance;
			}
		}

		return closest;
	}
}
