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

	static void dismountStopsStaleSteering(GameTestHelper helper, EntityType<?>... vehicleTypes) {
		var owner = SurvivalGameTestPlayers.createWithoutToyCleanup(helper);
		try {
			for (EntityType<?> type : vehicleTypes) {
				MushroomYorkieEntity yorkie = helper.spawn(ModEntities.MUSHROOM_YORKIE, 3, 2, 3);
				Entity vehicle = helper.spawn(type, 3, 2, 3);
				try {
					yorkie.claimFor(owner);
					yorkie.setMushroomOrderedToSit(true);
					helper.assertTrue(yorkie.startRiding(vehicle), "Stale-steering fixture could not mount");
					// A native movement intent queued before leaving the seat must not
					// carry the explicit sitter back off its new landing place.
					yorkie.getMoveControl().setWantedPosition(yorkie.getX() - 2, yorkie.getY(), yorkie.getZ(), 1.25D);
					yorkie.setDeltaMovement(-0.1D, 0.0D, 0.0D);
					yorkie.dismountForOwner();
					helper.assertTrue(!yorkie.isPassenger() && yorkie.isOrderedToSit(), "Help changed the sit order or retained its passenger");
					helper.assertTrue(yorkie.getDeltaMovement().horizontalDistanceSqr() < 1.0E-8D,
							"Owner dismount retained old vehicle movement for " + type);
					helper.assertTrue(Math.abs(yorkie.getMoveControl().getWantedX() - yorkie.getX()) < 0.01D,
							"Owner dismount retained old walking steering for " + type);
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

	private static void run(GameTestHelper helper, EntityType<?> vehicleType, boolean flight) {
		for (int x = 0; x <= 6; x++) {
			for (int z = 0; z <= 6; z++) {
				helper.setBlock(x, 1, z, Blocks.STONE);
			}
		}
		var owner = SurvivalGameTestPlayers.createWithoutToyCleanup(helper);
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
						if (flight && tick == 79) {
							owner.getAbilities().flying = false;
							helper.assertTrue(!yorkie.startRiding(vehicle), "Landing early lost the remaining dismount grace period");
							owner.getAbilities().flying = true;
						}
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
