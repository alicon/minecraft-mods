package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.item.ModItems;
import java.util.function.Consumer;
import java.util.function.UnaryOperator;
import net.minecraft.core.component.DataComponents;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.util.Unit;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;

/** A free creative throw and a consumed possession must keep their meaning across owner mode changes. */
final class FetchModeChangeScenarios {
	private FetchModeChangeScenarios() {
	}

	static void realToySurvivesOwnerBecomingCreative(GameTestHelper helper, UnaryOperator<MushroomYorkieEntity> roundTrip) {
		Fixture fixture = carrying(helper, false);
		fixture.owner().setGameMode(GameType.CREATIVE);
		fixture = restore(helper, fixture, roundTrip);
		fixture.yorkie().setPos(fixture.owner().getX() + 1, fixture.owner().getY(), fixture.owner().getZ());
		fixture.fetch().tick();
		fixture.fetch().stop();
		fixture.owner().setGameMode(GameType.SURVIVAL);
		assertOneOriginalInInventory(helper, fixture);
		helper.succeed();
	}

	static void creativeCopyDoesNotDuplicateAfterSurvivalSwitch(GameTestHelper helper, UnaryOperator<MushroomYorkieEntity> roundTrip) {
		Fixture fixture = carrying(helper, true);
		fixture.owner().setGameMode(GameType.SURVIVAL);
		fixture = restore(helper, fixture, roundTrip);
		fixture.yorkie().setPos(fixture.owner().getX() + 1, fixture.owner().getY(), fixture.owner().getZ());
		fixture.fetch().tick();
		fixture.fetch().stop();
		fixture.fetch().stop();
		assertOneOriginalInInventory(helper, fixture);
		helper.succeed();
	}

	static void creativeCopyDoesNotDuplicateOnInterruption(GameTestHelper helper, UnaryOperator<MushroomYorkieEntity> roundTrip) {
		Fixture fixture = restore(helper, carrying(helper, true), roundTrip);
		fixture.yorkie().setMushroomOrderedToSit(true);
		fixture.fetch().stop();
		fixture.fetch().stop();
		assertOneOriginalInInventory(helper, fixture);
		MushroomYorkieEntity restored = roundTrip.apply(fixture.yorkie());
		helper.assertTrue(restored.getMainHandItem().isEmpty(), "Discarded creative copy replayed after another save");
		helper.succeed();
	}

	static void creativeCopyDoesNotDuplicateOnDeath(GameTestHelper helper, UnaryOperator<MushroomYorkieEntity> roundTrip,
			Consumer<MushroomYorkieEntity> lethalDamage) {
		Fixture fixture = restore(helper, carrying(helper, true), roundTrip);
		lethalDamage.accept(fixture.yorkie());
		helper.assertTrue(fixture.yorkie().getMainHandItem().isEmpty(), "Free copy survived into death loot cleanup");
		fixture.fetch().stop();
		fixture.fetch().stop();
		assertOneOriginalInInventory(helper, fixture);
		helper.succeed();
	}

	static void survivalRethrowReturnsAnInheritedCopy(GameTestHelper helper, UnaryOperator<MushroomYorkieEntity> roundTrip) {
		Fixture fixture = restore(helper, carrying(helper, false, true), roundTrip);
		fixture.yorkie().setPos(fixture.owner().getX() + 1, fixture.owner().getY(), fixture.owner().getZ());
		fixture.fetch().tick();
		fixture.fetch().stop();
		assertOneOriginalInInventory(helper, fixture);
		helper.succeed();
	}

	static void creativeCopyCannotBeCollectedAsInventory(GameTestHelper helper) {
		MushroomYorkieEntity anchor = helper.spawn(ModEntities.MUSHROOM_YORKIE, 3, 2, 3);
		anchor.setNoAi(true);
		ServerPlayer owner = SurvivalGameTestPlayers.create(helper);
		owner.setPos(anchor.getX(), anchor.getY(), anchor.getZ());
		owner.setGameMode(GameType.CREATIVE);
		owner.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(ModItems.YORKIE_BALL));
		ModItems.YORKIE_BALL.use(helper.getLevel(), owner, InteractionHand.MAIN_HAND);
		var thrown = helper.getLevel().getEntitiesOfClass(ItemEntity.class, owner.getBoundingBox().inflate(3),
				item -> !item.isRemoved() && item.getItem().is(ModItems.YORKIE_BALL));
		helper.assertTrue(thrown.size() == 1, "Throw did not produce one copy");
		ItemEntity toy = thrown.getFirst();
		for (int tick = 0; tick < 40; tick++) {
			toy.tick();
		}
		owner.setGameMode(GameType.SURVIVAL);
		toy.setPos(owner.getX(), owner.getY(), owner.getZ());
		toy.playerTouch(owner);
		helper.assertTrue(!toy.isRemoved() && owner.getInventory().countItem(ModItems.YORKIE_BALL) == 1,
				"Free creative copy became a second inventory item after its normal pickup delay");
		helper.succeed();
	}

	static void realToySurvivesFullCreativeInventory(GameTestHelper helper, UnaryOperator<MushroomYorkieEntity> roundTrip) {
		fullCreativeInventory(helper, roundTrip, false);
	}

	static void realToySurvivesPartialCreativeInventory(GameTestHelper helper, UnaryOperator<MushroomYorkieEntity> roundTrip) {
		fullCreativeInventory(helper, roundTrip, true);
	}

	private static void fullCreativeInventory(GameTestHelper helper, UnaryOperator<MushroomYorkieEntity> roundTrip, boolean partial) {
		Fixture fixture = restore(helper, carrying(helper, false), roundTrip);
		fixture.owner().setGameMode(GameType.CREATIVE);
		var inventory = fixture.owner().getInventory();
		for (int slot = 0; slot < inventory.getContainerSize(); slot++) {
			inventory.setItem(slot, new ItemStack(Items.STONE, 64));
		}
		if (partial) {
			inventory.setItem(0, new ItemStack(ModItems.YORKIE_BALL, new ItemStack(ModItems.YORKIE_BALL).getMaxStackSize() - 1));
			fixture.yorkie().getMainHandItem().setCount(3);
		}
		fixture.yorkie().setPos(fixture.owner().getX() + 1, fixture.owner().getY(), fixture.owner().getZ());
		fixture.fetch().tick();
		fixture.fetch().stop();
		int ground = helper.getLevel().getEntitiesOfClass(ItemEntity.class, fixture.owner().getBoundingBox().inflate(3),
				item -> !item.isRemoved() && item.getItem().is(ModItems.YORKIE_BALL)).stream().mapToInt(item -> item.getItem().getCount()).sum();
		helper.assertTrue(ground == 0 && inventory.countItem(ModItems.YORKIE_BALL) == (partial ? new ItemStack(ModItems.YORKIE_BALL).getMaxStackSize() : 0)
				&& fixture.yorkie().getMainHandItem().getCount() == (partial ? 2 : 1),
				"Full creative inventory lost the held remainder: ground=" + ground + ", inventory=" + inventory.countItem(ModItems.YORKIE_BALL));
		fixture.fetch().stop();
		fixture = restore(helper, fixture, roundTrip);
		inventory.setItem(1, ItemStack.EMPTY);
		fixture.fetch().tick();
		fixture.fetch().stop();
		helper.assertTrue(fixture.yorkie().getMainHandItem().isEmpty()
				&& inventory.countItem(ModItems.YORKIE_BALL) == (partial ? new ItemStack(ModItems.YORKIE_BALL).getMaxStackSize() + 2 : 1),
				"Held remainder did not return after inventory space was freed");
		helper.succeed();
	}

	private static Fixture carrying(GameTestHelper helper, boolean creativeThrow) {
		return carrying(helper, creativeThrow, false);
	}

	private static Fixture carrying(GameTestHelper helper, boolean creativeThrow, boolean inheritedCopy) {
		MushroomYorkieEntity yorkie = helper.spawn(ModEntities.MUSHROOM_YORKIE, 3, 2, 3);
		yorkie.setNoAi(true);
		ServerPlayer owner = SurvivalGameTestPlayers.create(helper);
		owner.setPos(yorkie.getX() - 8, yorkie.getY(), yorkie.getZ());
		yorkie.claimFor(owner);
		ItemEntity toy;
		if (creativeThrow || inheritedCopy) {
			owner.setGameMode(creativeThrow ? GameType.CREATIVE : GameType.SURVIVAL);
			ItemStack original = new ItemStack(ModItems.YORKIE_BALL);
			if (inheritedCopy) {
				original.set(DataComponents.INTANGIBLE_PROJECTILE, Unit.INSTANCE);
			}
			owner.setItemInHand(InteractionHand.MAIN_HAND, original);
			ModItems.YORKIE_BALL.use(helper.getLevel(), owner, InteractionHand.MAIN_HAND);
			var thrown = helper.getLevel().getEntitiesOfClass(ItemEntity.class, owner.getBoundingBox().inflate(3),
					item -> !item.isRemoved() && item.getItem().is(ModItems.YORKIE_BALL));
			helper.assertTrue(thrown.size() == 1, "Creative throw fixture did not create exactly one toy");
			helper.assertTrue(owner.getInventory().countItem(ModItems.YORKIE_BALL) == (creativeThrow ? 1 : 0), "Throw consumed the wrong number of originals");
			toy = thrown.getFirst();
			toy.setPos(yorkie.getX(), yorkie.getY(), yorkie.getZ());
		} else {
			toy = helper.spawnItem(ModItems.YORKIE_BALL, 3, 2, 3);
		}
		FetchBallGoal fetch = new FetchBallGoal(yorkie);
		helper.assertTrue(fetch.canUse(), "Fixture toy was not found");
		fetch.start();
		fetch.tick();
		helper.assertTrue(toy.isRemoved() && yorkie.getMainHandItem().getCount() == 1, "Fixture toy was not carried");
		return new Fixture(yorkie, owner, fetch);
	}

	private static Fixture restore(GameTestHelper helper, Fixture fixture, UnaryOperator<MushroomYorkieEntity> roundTrip) {
		MushroomYorkieEntity restored = roundTrip.apply(fixture.yorkie());
		FetchBallGoal fetch = new FetchBallGoal(restored);
		helper.assertTrue(fetch.canUse(), "Carried toy could not resume after load");
		fetch.start();
		return new Fixture(restored, fixture.owner(), fetch);
	}

	private static void assertOneOriginalInInventory(GameTestHelper helper, Fixture fixture) {
		int inventory = fixture.owner().getInventory().countItem(ModItems.YORKIE_BALL);
		int ground = helper.getLevel().getEntitiesOfClass(ItemEntity.class, fixture.yorkie().getBoundingBox().inflate(12),
				item -> !item.isRemoved() && item.getItem().is(ModItems.YORKIE_BALL)).stream()
				.mapToInt(item -> item.getItem().getCount()).sum();
		int held = fixture.yorkie().getMainHandItem().is(ModItems.YORKIE_BALL) ? fixture.yorkie().getMainHandItem().getCount() : 0;
		helper.assertTrue(inventory == 1 && ground == 0 && held == 0,
				"Toy possession lost or duplicated: inventory=" + inventory + ", ground=" + ground + ", held=" + held);
	}

	private record Fixture(MushroomYorkieEntity yorkie, ServerPlayer owner, FetchBallGoal fetch) {
	}
}
