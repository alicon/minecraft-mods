package dev.alicon.mushroomyorkie.entity;

import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.tags.FluidTags;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.Vec3;

/** Full native passenger ticks distinguish dry floating seats from actual water hazards. */
final class VehicleWaterRestScenarios {
	private enum WaterState { FLOATING, SUBMERGED, BUBBLE }

	private VehicleWaterRestScenarios() {
	}

	static void floatingPassengerKeepsSit(GameTestHelper helper, EntityType<?> vehicleType) {
		run(helper, vehicleType, WaterState.FLOATING);
	}

	static void submergedPassengerRejectsSit(GameTestHelper helper) {
		run(helper, EntityType.MINECART, WaterState.SUBMERGED);
	}

	static void submergedBoatRejectsSit(GameTestHelper helper, EntityType<?> vehicleType) {
		run(helper, vehicleType, WaterState.SUBMERGED);
	}

	static void bubblePassengerRejectsSit(GameTestHelper helper, EntityType<?> vehicleType) {
		run(helper, vehicleType, WaterState.BUBBLE);
	}

	private static void run(GameTestHelper helper, EntityType<?> vehicleType, WaterState waterState) {
		for (int x = 0; x <= 6; x++) {
			for (int z = 0; z <= 6; z++) {
				for (int y = -1; y <= 1; y++) {
					helper.setBlock(x, y, z, x > 0 && x < 6 && z > 0 && z < 6 && y >= 0 ? Blocks.WATER : Blocks.STONE);
				}
			}
		}
		if (waterState == WaterState.BUBBLE) {
			helper.setBlock(3, -1, 3, Blocks.MAGMA_BLOCK);
			helper.setBlock(3, 0, 3, Blocks.BUBBLE_COLUMN);
			helper.setBlock(3, 1, 3, Blocks.BUBBLE_COLUMN);
		}
		var owner = SurvivalGameTestPlayers.createWithoutToyCleanup(helper);
		owner.setPos(helper.absoluteVec(new Vec3(0.5D, 2.0D, 3.5D)));
		MushroomYorkieEntity yorkie = helper.spawn(ModEntities.MUSHROOM_YORKIE, 3, 2, 3);
		yorkie.claimFor(owner);
		yorkie.setMushroomOrderedToSit(true);
		Entity vehicle = helper.spawn(vehicleType, 3, 2, 3);
		vehicle.setPos(helper.absoluteVec(new Vec3(3.5D, waterState == WaterState.SUBMERGED ? 0.2D : 2.1D, 3.5D)));
		vehicle.setNoGravity(waterState == WaterState.SUBMERGED);
		boolean scheduled = false;
		Runnable cleanup = () -> {
			yorkie.discard();
			vehicle.discard();
			if (helper.getLevel().getServer().getPlayerList().getPlayer(owner.getUUID()) == owner) {
				helper.getLevel().getServer().getPlayerList().remove(owner);
			}
			owner.discard();
		};
		try {
			helper.assertTrue(yorkie.isOrderedToSit() && yorkie.startRiding(vehicle), "Native water passenger fixture did not start seated and ordered to sit");
			helper.runAfterDelay(8, () -> {
				try {
					helper.assertTrue(yorkie.getVehicle() == vehicle && vehicle.getPassengers().contains(yorkie), "Water fixture lost its original passenger");
					if (waterState == WaterState.FLOATING) {
						helper.assertTrue(!yorkie.isInWater() && helper.getLevel().getFluidState(yorkie.blockPosition()).is(FluidTags.WATER),
								"Floating fixture did not isolate a dry passenger with a water block at its feet");
						helper.assertTrue(yorkie.isOrderedToSit() && yorkie.isInSittingPose(), "Dry floating passenger lost the owner's sit order");
					} else {
						if (waterState == WaterState.SUBMERGED) {
							helper.assertTrue(yorkie.isInWater(), "Submerged cart did not actually put Mushroom in water");
						} else {
							helper.assertTrue(helper.getLevel().getBlockState(yorkie.blockPosition()).is(Blocks.BUBBLE_COLUMN), "Bubble control did not retain a native bubble column at the passenger");
						}
						helper.assertTrue(!yorkie.isOrderedToSit() && !yorkie.isInSittingPose() && !yorkie.isMushroomSleeping(), "A real water hazard retained passenger rest");
					}
					helper.succeed();
				} finally {
					cleanup.run();
				}
			});
			scheduled = true;
		} finally {
			if (!scheduled) {
				cleanup.run();
			}
		}
	}
}
