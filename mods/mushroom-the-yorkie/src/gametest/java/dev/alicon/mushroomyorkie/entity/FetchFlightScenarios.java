package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.item.ModItems;
import java.util.function.Consumer;
import java.util.function.UnaryOperator;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.MoverType;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.Vec3;

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

	static void airborneReturnSurvivesReload(GameTestHelper helper, UnaryOperator<MushroomYorkieEntity> roundTrip, boolean landed) {
		Fixture fixture = create(helper, true, 1.5D);
		MushroomYorkieEntity restored = null;
		try {
			for (int tick = 0; tick < 150 && fixture.yorkie().getMainHandItem().isEmpty(); tick++) {
				step(fixture);
			}
			helper.assertTrue(!fixture.yorkie().getMainHandItem().isEmpty() && fixture.yorkie().isNoGravity(),
					"Reload fixture did not reach an airborne carried return");
			if (landed) {
				fixture.owner().getAbilities().flying = false;
				fixture.owner().setPos(fixture.owner().getX(), fixture.owner().getY() - 1.5D, fixture.owner().getZ());
			}
			restored = roundTrip.apply(fixture.yorkie());
			helper.assertTrue(restored.isNoGravity(), "Native serialization did not preserve airborne state");
			FetchBallGoal fetch = new FetchBallGoal(restored);
			helper.assertTrue(fetch.canUse(), "Reloaded airborne toy could not resume");
			fetch.start();
			Fixture resumed = new Fixture(restored, fixture.owner(), fetch, fixture.toy());
			for (int tick = 0; tick < 300 && fetch.canContinueToUse(); tick++) {
				step(resumed);
				helper.assertTrue(restored.getMainHandItem().isEmpty() || restored.isNoGravity(),
						"Reload released airborne return support: landed=" + landed);
			}
			helper.assertTrue(fixture.owner().getInventory().countItem(ModItems.YORKIE_BALL) == 1
					&& restored.getMainHandItem().isEmpty() && fixture.toy().isRemoved(), "Reloaded airborne toy never returned");
			fetch.stop();
			helper.succeed();
		} finally {
			fixture.toy().discard();
			fixture.yorkie().discard();
			if (restored != null) {
				restored.discard();
			}
		}
	}

	static void invalidFootprintDoesNotLeakFixtures(GameTestHelper helper) {
		Fixture[] created = new Fixture[1];
		RuntimeException failure = null;
		try {
			try {
				create(helper, false, 1.5D, fixture -> created[0] = fixture);
			} catch (RuntimeException error) {
				failure = error;
			}
			helper.assertTrue(failure != null && failure.getMessage().startsWith("Fetch toy extends outside declared horizontal fixture"),
					"Small-template negative control did not reject its invalid footprint");
			helper.assertTrue(created[0] != null && created[0].yorkie().isRemoved() && created[0].toy().isRemoved()
					&& helper.getLevel().getServer().getPlayerList().getPlayer(created[0].owner().getUUID()) == null,
					"Rejected fixture leaked its original pet, toy or owner");
			helper.succeed();
		} finally {
			// Keep the negative control isolated even if the cleanup regression fails.
			if (created[0] != null) {
				discardFixture(helper, created[0]);
			}
		}
	}

	private static Fixture create(GameTestHelper helper, boolean cliff, double ownerHeight) {
		return create(helper, cliff, ownerHeight, fixture -> { });
	}

	private static Fixture create(GameTestHelper helper, boolean cliff, double ownerHeight, Consumer<Fixture> observe) {
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
		Fixture fixture = new Fixture(yorkie, owner, fetch, toy);
		try {
			observe.accept(fixture);
			// Vertical out-of-bounds is intentional for below-platform returns. The
			// declared horizontal footprint must include every spawn and cliff block.
			assertHorizontalBounds(helper, "toy", toy.position());
			assertHorizontalBounds(helper, "pet", yorkie.position());
			assertHorizontalBounds(helper, "owner", owner.position());
			if (cliff) {
				assertHorizontalBounds(helper, "cliff floor", helper.absoluteVec(new Vec3(0.0D, 1.0D, 0.0D)));
				assertHorizontalBounds(helper, "cliff floor", helper.absoluteVec(new Vec3(10.0D, 1.0D, 6.0D)));
			}
			boolean canFetch = fetch.canUse();
			helper.assertTrue(canFetch, "Flight fixture did not find the toy: pet=" + yorkie.position()
					+ ", toy=" + toy.position() + ", removed=" + toy.isRemoved()
					+ ", toyChunkLoaded=" + helper.getLevel().hasChunkAt(toy.blockPosition())
					+ ", ownerResolved=" + (yorkie.getOwner() == owner) + ", sameLevel=" + (owner.level() == yorkie.level())
					+ ", tame=" + yorkie.isTame() + ", hand=" + yorkie.getMainHandItem() + ", sitting=" + yorkie.isOrderedToSit()
					+ ", sleeping=" + yorkie.isMushroomSleeping() + ", scared=" + yorkie.scaredRunTicks
					+ ", exactToyQueryCount=" + helper.getLevel().getEntitiesOfClass(ItemEntity.class, toy.getBoundingBox(), item -> item.getUUID().equals(toy.getUUID())).size());
			fetch.start();
			return fixture;
		} catch (RuntimeException error) {
			discardFixture(helper, fixture);
			throw error;
		}
	}

	private static void assertHorizontalBounds(GameTestHelper helper, String label, Vec3 position) {
		var bounds = helper.getBounds();
		helper.assertTrue(position.x >= bounds.minX && position.x < bounds.maxX
				&& position.z >= bounds.minZ && position.z < bounds.maxZ,
				"Fetch " + label + " extends outside declared horizontal fixture: position=" + position + ", bounds=" + bounds);
	}

	private static void discardFixture(GameTestHelper helper, Fixture fixture) {
		fixture.toy().discard();
		fixture.yorkie().discard();
		helper.getLevel().getServer().getPlayerList().remove(fixture.owner());
		fixture.owner().discard();
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
