package dev.alicon.mushroomyorkie.entity;

import java.util.Comparator;
import net.minecraft.core.BlockPos;
import net.minecraft.core.GlobalPos;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.entity.EntityTypeTest;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/** Owner interactions shared by the camp mat and Mushroom's regular Use command. */
public final class MushroomCampInteractions {
	private static final int ASSIGN_RADIUS = 12;

	private MushroomCampInteractions() {
	}

	/** Assigns the mat to the closest living dog owned by this player and within normal camp range. */
	public static void markCamp(ServerLevel level, BlockPos pos, Player owner) {
		Vec3 center = Vec3.atCenterOf(pos);
		var dog = level.getEntities(EntityTypeTest.forClass(MushroomYorkieEntity.class),
				new AABB(pos).inflate(ASSIGN_RADIUS),
				candidate -> candidate.isAlive() && candidate.isOwnedBy(owner)
						&& candidate.distanceToSqr(center) <= ASSIGN_RADIUS * ASSIGN_RADIUS).stream()
				.min(Comparator.comparingDouble(candidate -> candidate.distanceToSqr(center)))
				.orElse(null);
		if (dog == null) {
			notice(owner, "camp_no_dog");
		} else if (!MushroomExpeditionFooting.standable(level, dog, pos)) {
			notice(owner, "camp_unsafe");
		} else {
			dog.expeditionCamp.mark(GlobalPos.of(level.dimension(), pos.immutable()));
			notice(owner, "camp_marked");
		}
	}

	static boolean recall(MushroomYorkieEntity dog, Player owner) {
		if (!dog.expeditionCamp.holding()) {
			return false;
		}
		dog.expeditionCamp.setHolding(false);
		dog.getNavigation().stop();
		notice(owner, "camp_recalled");
		return true;
	}

	static void notice(Player player, String key) {
		player.displayClientMessage(Component.translatable("message.mushroom_yorkie." + key), true);
	}
}
