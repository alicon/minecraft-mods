package dev.alicon.mushroomyorkie.entity;

import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.Vec3;

/** Native collision regression for a small swimmer beneath a boat against a reachable bank. */
final class BoatBankEscapeScenarios {

	private BoatBankEscapeScenarios() {
	}

	static void escapeBank(GameTestHelper helper, EntityType<?> boatType) {
		for (int x = 0; x <= 10; x++) {
			for (int z = 0; z <= 6; z++) {
				for (int y = 1; y <= 3; y++) {
					boolean water = x > 0 && x < 7 && z >= 2 && z <= 4 && y >= 2;
					helper.setBlock(x, y, z, water ? Blocks.WATER : Blocks.STONE);
				}
			}
		}
		var owner = SurvivalGameTestPlayers.createWithoutToyCleanup(helper);
		owner.setPos(helper.absoluteVec(new Vec3(9.0D, 4.0D, 3.5D)));
		MushroomYorkieEntity yorkie = helper.spawn(ModEntities.MUSHROOM_YORKIE, 6, 3, 3);
		yorkie.setPos(helper.absoluteVec(new Vec3(6.79D, 3.06D, 3.5D)));
		yorkie.claimFor(owner);
		Entity boat = boatType == null ? null : helper.spawn(boatType, 6, 3, 3);
		if (boat != null) {
			boat.setPos(helper.absoluteVec(new Vec3(6.3125D, 3.52D, 3.5D)));
			// Reproduce a recent owner-assisted exit, including normal boarding grace.
			yorkie.startRiding(boat);
			yorkie.dismountForOwner();
			yorkie.setPos(helper.absoluteVec(new Vec3(6.79D, 3.06D, 3.5D)));
		}
		Runnable cleanup = () -> {
			yorkie.discard();
			if (boat != null) {
				boat.discard();
			}
			if (helper.getLevel().getServer().getPlayerList().getPlayer(owner.getUUID()) == owner) {
				helper.getLevel().getServer().getPlayerList().remove(owner);
			}
			owner.discard();
		};
		boolean scheduled = false;
		try {
			helper.runAfterDelay(2, () -> {
				if (!yorkie.isInWater() || yorkie.isPassenger()) {
					cleanup.run();
					helper.assertTrue(false, "Boat-bank control must begin with a genuinely wet unmounted pet");
				}
			});
			helper.runAfterDelay(160, () -> {
				try {
					helper.assertTrue(yorkie.getHealth() == yorkie.getMaxHealth(), "Boat-bank recovery damaged Mushroom");
					helper.assertTrue(!yorkie.isInWater() && yorkie.onGround()
							&& yorkie.getY() >= helper.absoluteVec(new Vec3(0, 4, 0)).y,
							"Mushroom did not escape the boat-bank swim trap: position=" + yorkie.position()
									+ ", air=" + yorkie.getAirSupply() + ", boat=" + (boat == null ? "absent" : boat.position())
									+ ", escape=" + yorkie.waterEscape);
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
