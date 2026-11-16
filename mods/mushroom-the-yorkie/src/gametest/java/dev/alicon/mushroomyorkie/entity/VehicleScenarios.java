package dev.alicon.mushroomyorkie.entity;

import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Blocks;

/** Real native boarding attempts across owner-assisted and creative-flight dismounts. */
final class VehicleScenarios {
	private VehicleScenarios() {
	}

	static void ownerDismountAllowsTimeToLeave(GameTestHelper helper, EntityType<?> vehicleType) {
		run(helper, vehicleType, false);
	}

	static void flyingOwnerPreventsReboarding(GameTestHelper helper, EntityType<?> vehicleType) {
		run(helper, vehicleType, true);
	}

	private static void run(GameTestHelper helper, EntityType<?> vehicleType, boolean flight) {
		for (int x = 0; x <= 6; x++) {
			for (int z = 0; z <= 6; z++) {
				helper.setBlock(x, 1, z, Blocks.STONE);
			}
		}
		var owner = SurvivalGameTestPlayers.create(helper);
		owner.setGameMode(GameType.CREATIVE);
		owner.setPos(helper.absoluteVec(new net.minecraft.world.phys.Vec3(1.5D, 2.0D, 3.5D)));
		try {
			for (boolean sitting : new boolean[]{false, true}) {
				MushroomYorkieEntity yorkie = helper.spawn(ModEntities.MUSHROOM_YORKIE, 3, 2, 3);
				Entity vehicle = helper.spawn(vehicleType, 3, 2, 3);
				yorkie.setNoAi(true);
				yorkie.claimFor(owner);
				yorkie.setMushroomOrderedToSit(sitting);
				owner.getAbilities().flying = false;
				try {
					helper.assertTrue(yorkie.startRiding(vehicle), "Vehicle fixture could not board initially");
					if (flight) {
						owner.getAbilities().flying = true;
						MushroomFlightController.followFlyingOwner(yorkie);
					} else {
						MushroomOwnerCommandInteractions.handle(yorkie, owner, ItemStack.EMPTY);
					}
					helper.assertTrue(!yorkie.isPassenger() && yorkie.isOrderedToSit() == sitting, "Dismount failed or changed the sit order");
					// Native tick decrements vanilla's boarding cooldown. NoAI isolates the
					// boarding decision; live scenarios separately cover full goal priority.
					int wait = flight ? 220 : 80;
					for (int tick = 0; tick < wait; tick++) {
						yorkie.tick();
					}
					helper.assertTrue(!yorkie.startRiding(vehicle), flight
							? "Mushroom boarded again while the creative owner was flying"
							: "Mushroom could board again before the owner had time to leave");
					owner.getAbilities().flying = false;
					for (int tick = wait; tick < 220; tick++) {
						yorkie.tick();
					}
					helper.assertTrue(yorkie.startRiding(vehicle), "Normal boarding stayed disabled after landing and the grace period");
				} finally {
					yorkie.discard();
					vehicle.discard();
				}
			}
			helper.succeed();
		} finally {
			helper.getLevel().getServer().getPlayerList().remove(owner);
			owner.discard();
		}
	}
}
