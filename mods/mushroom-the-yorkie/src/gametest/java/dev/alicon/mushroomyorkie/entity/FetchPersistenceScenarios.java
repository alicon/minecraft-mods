package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.item.ModItems;
import java.util.function.Consumer;
import java.util.function.UnaryOperator;
import net.minecraft.core.component.DataComponents;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.item.ItemStack;

/** Shared assertions; each target supplies only its native save/load and damage APIs. */
final class FetchPersistenceScenarios {
	private FetchPersistenceScenarios() {
	}

	/** Save/reload a named toy after pickup and return exactly one copy with its components intact. */
	static void fetchedToySurvivesSaveAndReturns(GameTestHelper helper, UnaryOperator<MushroomYorkieEntity> roundTrip) {
		MushroomYorkieEntity yorkie = helper.spawn(ModEntities.MUSHROOM_YORKIE, 3, 2, 3);
		yorkie.setNoAi(true);
		var owner = SurvivalGameTestPlayers.create(helper);
		owner.setPos(yorkie.getX() - 8, yorkie.getY(), yorkie.getZ());
		yorkie.claimFor(owner);
		ItemEntity toy = helper.spawnItem(ModItems.YORKIE_BALL, 3, 2, 3);
		toy.getItem().set(DataComponents.CUSTOM_NAME, Component.literal("Fetch round trip"));
		FetchBallGoal fetch = new FetchBallGoal(yorkie);
		helper.assertTrue(fetch.canUse(), "Fixture toy was not found");
		fetch.start();
		fetch.tick();
		helper.assertTrue(toy.isRemoved(), "Fixture toy was not picked up");
		MushroomYorkieEntity restored = roundTrip.apply(yorkie);
		FetchBallGoal resumed = new FetchBallGoal(restored);
		helper.assertTrue(resumed.canUse(), "Carried toy was lost or could not resume after save/load");
		resumed.start();
		restored.setPos(owner.getX() + 1, owner.getY(), owner.getZ());
		resumed.tick();
		resumed.stop();
		resumed.stop();
		int count = owner.getInventory().countItem(ModItems.YORKIE_BALL);
		var ground = helper.getLevel().getEntitiesOfClass(ItemEntity.class, restored.getBoundingBox().inflate(2),
				item -> !item.isRemoved() && item.getItem().is(ModItems.YORKIE_BALL));
		helper.assertTrue(count == 1 && ground.isEmpty(), "Reloaded return lost or duplicated the toy: inventory=" + count + ", ground=" + ground.size()
				+ ", held=" + restored.getMainHandItem() + ", creative=" + owner.isCreative()
				+ ", sameOwner=" + (restored.getOwner() == owner));
		ItemStack returned = ItemStack.EMPTY;
		for (int slot = 0; slot < owner.getInventory().getContainerSize(); slot++) {
			if (owner.getInventory().getItem(slot).is(ModItems.YORKIE_BALL)) {
				returned = owner.getInventory().getItem(slot);
			}
		}
		helper.assertTrue(Component.literal("Fetch round trip").equals(returned.get(DataComponents.CUSTOM_NAME)),
				"Fetched toy components changed across save/load");
		helper.succeed();
	}

	/** A post-load sit interruption and another save must not replay or duplicate the carried toy. */
	static void stoppedReloadedFetchDoesNotDuplicate(GameTestHelper helper, UnaryOperator<MushroomYorkieEntity> roundTrip) {
		MushroomYorkieEntity yorkie = helper.spawn(ModEntities.MUSHROOM_YORKIE, 3, 2, 3);
		yorkie.setNoAi(true);
		var owner = SurvivalGameTestPlayers.create(helper);
		owner.setPos(yorkie.getX() - 8, yorkie.getY(), yorkie.getZ());
		yorkie.claimFor(owner);
		yorkie.setItemSlot(net.minecraft.world.entity.EquipmentSlot.MAINHAND, new ItemStack(ModItems.YORKIE_BALL));
		MushroomYorkieEntity restored = roundTrip.apply(yorkie);
		for (int cycle = 0; cycle < 2; cycle++) {
			FetchBallGoal fetch = new FetchBallGoal(restored);
			helper.assertTrue(fetch.canUse(), "Reloaded toy was not available");
			fetch.start();
			if (cycle == 1) {
				fetch.tick();
			}
			restored.setMushroomOrderedToSit(true);
			fetch.stop();
			fetch.stop();
			var ground = helper.getLevel().getEntitiesOfClass(ItemEntity.class, restored.getBoundingBox().inflate(2),
					item -> !item.isRemoved() && item.getItem().is(ModItems.YORKIE_BALL));
			helper.assertTrue(ground.size() == 1 && ground.getFirst().getItem().getCount() == 1,
					"Post-load interruption duplicated or lost a toy in cycle " + cycle);
			restored.setMushroomOrderedToSit(false);
			restored = roundTrip.apply(restored);
		}
		helper.succeed();
	}

	/** A valid stored toy stack must be returned in full, not silently reduced to one item. */
	static void resumedFetchReturnsWholeStoredStack(GameTestHelper helper, UnaryOperator<MushroomYorkieEntity> roundTrip) {
		MushroomYorkieEntity yorkie = helper.spawn(ModEntities.MUSHROOM_YORKIE, 3, 2, 3);
		yorkie.setNoAi(true);
		var owner = SurvivalGameTestPlayers.create(helper);
		owner.setPos(yorkie.getX() - 8, yorkie.getY(), yorkie.getZ());
		yorkie.claimFor(owner);
		yorkie.setItemSlot(net.minecraft.world.entity.EquipmentSlot.MAINHAND, new ItemStack(ModItems.YORKIE_BALL, 3));
		MushroomYorkieEntity restored = roundTrip.apply(yorkie);
		FetchBallGoal fetch = new FetchBallGoal(restored);
		helper.assertTrue(fetch.canUse(), "Stored toy stack could not resume");
		fetch.start();
		restored.setPos(owner.getX() + 1, owner.getY(), owner.getZ());
		fetch.tick();
		fetch.stop();
		helper.assertTrue(owner.getInventory().countItem(ModItems.YORKIE_BALL) == 3, "Stored toy stack was truncated");
		helper.succeed();
	}

	/** The owner's carried toy is a possession, not random mob loot, including environmental deaths. */
	static void carriedToyDropsOnEnvironmentalDeath(GameTestHelper helper, UnaryOperator<MushroomYorkieEntity> roundTrip,
			Consumer<MushroomYorkieEntity> lethalDamage) {
		MushroomYorkieEntity yorkie = helper.spawn(ModEntities.MUSHROOM_YORKIE, 3, 2, 3);
		yorkie.setNoAi(true);
		var owner = SurvivalGameTestPlayers.create(helper);
		owner.setPos(yorkie.getX() - 8, yorkie.getY(), yorkie.getZ());
		yorkie.claimFor(owner);
		ItemEntity toy = helper.spawnItem(ModItems.YORKIE_BALL, 3, 2, 3);
		FetchBallGoal fetch = new FetchBallGoal(yorkie);
		helper.assertTrue(fetch.canUse(), "Fixture toy was not found");
		fetch.start();
		fetch.tick();
		helper.assertTrue(toy.isRemoved(), "Fixture toy was not picked up");
		yorkie = roundTrip.apply(yorkie);
		FetchBallGoal resumed = new FetchBallGoal(yorkie);
		helper.assertTrue(resumed.canUse(), "Saved toy could not resume before damage");
		resumed.start();
		lethalDamage.accept(yorkie);
		resumed.stop();
		resumed.stop();
		var ground = helper.getLevel().getEntitiesOfClass(ItemEntity.class, yorkie.getBoundingBox().inflate(2),
				item -> !item.isRemoved() && item.getItem().is(ModItems.YORKIE_BALL));
		helper.assertTrue(ground.size() == 1 && ground.getFirst().getItem().getCount() == 1,
				"Environmental death lost the owner's carried toy");
		helper.succeed();
	}

}
