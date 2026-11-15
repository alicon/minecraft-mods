package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.item.ModItems;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.MoverType;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Blocks;

/** Exercises real fetch goals and flight steering in their server order, with deterministic native movement. */
final class FetchFlightScenarios {
	private FetchFlightScenarios() {
	}

	static void flyingOwnerFetchReturns(GameTestHelper helper) {
		assertReturns(helper, false, 1.5D);
	}

	static void flyingFetchReturnsFromBelowPlatform(GameTestHelper helper) {
		assertReturns(helper, true, 1.5D);
	}

	static void fractionalOwnerHeightReturns(GameTestHelper helper) {
		assertReturns(helper, false, 1.4D);
	}

	private static void assertReturns(GameTestHelper helper, boolean cliff, double ownerHeight) {
		Fixture fixture = create(helper, cliff, ownerHeight);
		StringBuilder trace = new StringBuilder();
		try {
			for (int tick = 0; tick < 300 && fixture.fetch().canContinueToUse(); tick++) {
				step(fixture);
				if (cliff && tick % 20 == 0) {
					trace.append("\n").append(tick).append(": relative=").append(fixture.yorkie().position().subtract(fixture.owner().position()))
							.append(", held=").append(fixture.yorkie().getMainHandItem().getCount()).append(", ").append(fixture.yorkie().fetchFlight);
				}
			}
			helper.assertTrue(fixture.owner().getInventory().countItem(ModItems.YORKIE_BALL) == 1
					&& fixture.yorkie().getMainHandItem().isEmpty() && fixture.toy().isRemoved(), "Flying fetch failed to return: cliff=" + cliff
					+ ", held=" + fixture.yorkie().getMainHandItem() + ", position=" + fixture.yorkie().position()
					+ ", route=" + fixture.yorkie().fetchFlight + trace);
			fixture.fetch().stop();
			helper.succeed();
		} finally {
			fixture.toy().discard();
			fixture.yorkie().discard();
		}
	}

	static void interruptedFlightReturnsToOwner(GameTestHelper helper) {
		Fixture fixture = create(helper, false, 1.5D);
		try {
			double startX = fixture.yorkie().getX();
			for (int tick = 0; tick < 3; tick++) {
				step(fixture);
			}
			helper.assertTrue(fixture.yorkie().getX() > startX + 0.25, "Flying fetch did not move toward its toy");
			fixture.fetch().stop();
			for (int tick = 0; tick < 30; tick++) {
				MushroomFlightController.followFlyingOwner(fixture.yorkie());
				fixture.yorkie().move(MoverType.SELF, fixture.yorkie().getDeltaMovement());
			}
			helper.assertTrue(fixture.yorkie().distanceToSqr(fixture.owner()) < 9.0D,
					"Stopped fetch left a stale flight target instead of normal owner following");
			helper.succeed();
		} finally {
			fixture.toy().discard();
			fixture.yorkie().discard();
		}
	}

	static void landingAfterPickupReturns(GameTestHelper helper) {
		assertLandingReturns(helper, true);
	}

	static void landingDuringChaseReturns(GameTestHelper helper) {
		assertLandingReturns(helper, false);
	}

	private static void assertLandingReturns(GameTestHelper helper, boolean afterPickup) {
		Fixture fixture = create(helper, true, 1.5D);
		try {
			for (int tick = 0; tick < (afterPickup ? 150 : 3) && fixture.yorkie().getMainHandItem().isEmpty(); tick++) {
				step(fixture);
			}
			helper.assertTrue(fixture.yorkie().getMainHandItem().isEmpty() != afterPickup, "Landing fixture reached the wrong fetch phase");
			fixture.owner().getAbilities().flying = false;
			fixture.owner().setPos(fixture.owner().getX(), fixture.owner().getY() - 1.5D, fixture.owner().getZ());
			for (int tick = 0; tick < 300 && fixture.fetch().canContinueToUse(); tick++) {
				step(fixture);
				helper.assertTrue(fixture.yorkie().getMainHandItem().isEmpty() || fixture.yorkie().isNoGravity(),
						"Owner landing released airborne fetch support before safe return");
			}
			helper.assertTrue(fixture.owner().getInventory().countItem(ModItems.YORKIE_BALL) == 1
					&& fixture.yorkie().getMainHandItem().isEmpty(), "Landed owner never received the carried toy");
			fixture.fetch().stop();
			helper.succeed();
		} finally {
			fixture.toy().discard();
			fixture.yorkie().discard();
		}
	}

	private static Fixture create(GameTestHelper helper, boolean cliff, double ownerHeight) {
		if (cliff) {
			for (int x = 0; x <= 10; x++) {
				for (int z = 0; z <= 6; z++) {
					for (int y = -4; y <= 1; y++) {
						helper.setBlock(x, y, z, y == 1 ? Blocks.STONE : Blocks.AIR);
					}
				}
			}
			for (int x = 6; x <= 8; x++) {
				for (int z = 2; z <= 4; z++) {
					helper.setBlock(x, 1, z, Blocks.AIR);
				}
			}
		}
		MushroomYorkieEntity yorkie = helper.spawn(ModEntities.MUSHROOM_YORKIE, 3, 2, 1);
		yorkie.setNoAi(true);
		ServerPlayer owner = SurvivalGameTestPlayers.create(helper);
		owner.setGameMode(GameType.CREATIVE);
		owner.getAbilities().flying = true;
		owner.setPos(yorkie.getX() - 2, yorkie.getY() + ownerHeight, yorkie.getZ());
		yorkie.claimFor(owner);
		ItemEntity toy = helper.spawnItem(ModItems.YORKIE_BALL, cliff ? 7 : 8, cliff ? -4 : 2, 3);
		FetchBallGoal fetch = new FetchBallGoal(yorkie);
		helper.assertTrue(fetch.canUse(), "Flight fixture did not find the toy");
		fetch.start();
		return new Fixture(yorkie, owner, fetch, toy);
	}

	private static void step(Fixture fixture) {
		fixture.yorkie().tickCount++;
		fixture.fetch().tick();
		MushroomFlightController.followFlyingOwner(fixture.yorkie());
		fixture.yorkie().move(MoverType.SELF, fixture.yorkie().getDeltaMovement());
	}

	private record Fixture(MushroomYorkieEntity yorkie, ServerPlayer owner, FetchBallGoal fetch, ItemEntity toy) {
	}
}
