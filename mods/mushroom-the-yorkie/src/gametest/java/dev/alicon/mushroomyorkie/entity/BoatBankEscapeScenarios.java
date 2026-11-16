package dev.alicon.mushroomyorkie.entity;

import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.level.GameType;

/** Native collision regression for a small swimmer beneath a boat against a reachable bank. */
final class BoatBankEscapeScenarios {
	private enum OwnerMode { SURVIVAL, CLOSE_CREATIVE, FAR_CREATIVE }

	private BoatBankEscapeScenarios() {
	}

	static void escapeBank(GameTestHelper helper, EntityType<?> boatType) {
		escapeBank(helper, boatType, OwnerMode.SURVIVAL);
	}

	static void closeCreativeEscapeBank(GameTestHelper helper, EntityType<?> boatType) {
		escapeBank(helper, boatType, OwnerMode.CLOSE_CREATIVE);
	}

	static void farCreativeEscapeBank(GameTestHelper helper, EntityType<?> boatType) {
		escapeBank(helper, boatType, OwnerMode.FAR_CREATIVE);
	}

	private static void escapeBank(GameTestHelper helper, EntityType<?> boatType, OwnerMode mode) {
		buildPool(helper);
		var owner = SurvivalGameTestPlayers.createWithoutToyCleanup(helper);
		owner.setGameMode(mode == OwnerMode.SURVIVAL ? GameType.SURVIVAL : GameType.CREATIVE);
		// Far recovery ends clear of the hull before normal boarding resumes at
		// tick200. The separate vehicle controls deliberately test that restoration.
		double ownerX = mode == OwnerMode.FAR_CREATIVE ? 10.5D : mode == OwnerMode.CLOSE_CREATIVE ? 8.5D : 9.0D;
		owner.setPos(helper.absoluteVec(new Vec3(ownerX, 4.0D, 3.5D)));
		MushroomYorkieEntity yorkie = helper.spawn(ModEntities.MUSHROOM_YORKIE, 6, 3, 3);
		long seed = GameTestSeeds.apply(yorkie, "bank-" + mode);
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
			new BoatBankRecoveryProbe(helper, yorkie, owner, boat != null, mode == OwnerMode.FAR_CREATIVE, seed, cleanup).start();
			scheduled = true;
		} finally {
			if (!scheduled) {
				cleanup.run();
			}
		}
	}

	static void buildPool(GameTestHelper helper) {
		for (int x = 0; x <= 10; x++) {
			for (int z = 0; z <= 6; z++) {
				for (int y = 1; y <= 3; y++) {
					boolean water = x > 0 && x < 7 && z >= 2 && z <= 4 && y >= 2;
					helper.setBlock(x, y, z, water ? Blocks.WATER : Blocks.STONE);
				}
			}
		}
	}
}
