package dev.alicon.mushroomyorkie.entity;

import net.minecraft.gametest.framework.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.item.Items;

/** Exercises the fetch goal lifecycle so interruption cannot destroy a carried toy. */
public final class FetchInterruptionGameTests {
	/** Stopping a picked-up fetch must drop exactly one toy, including repeated stop calls. */
	@GameTest(template = "fabric-gametest-api-v1:empty")
	public void stoppedFetchPreservesToy(GameTestHelper helper) {
		MushroomYorkieEntity yorkie = helper.spawn(ModEntities.MUSHROOM_YORKIE, 3, 2, 3);
		yorkie.setNoAi(true);
		var owner = helper.makeMockServerPlayerInLevel();
		owner.setPos(yorkie.getX() - 8, yorkie.getY(), yorkie.getZ());
		yorkie.claimFor(owner);
		ItemEntity toy = helper.spawnItem(Items.BONE, 3, 2, 3);
		FetchBallGoal fetch = new FetchBallGoal(yorkie);
		helper.assertTrue(fetch.canUse(), "Fetch did not find the fixture toy");
		fetch.start();
		fetch.tick();
		helper.assertTrue(toy.isRemoved(), "Fixture toy was not picked up");
		yorkie.setMushroomOrderedToSit(true);
		fetch.stop();
		fetch.stop();
		var toys = helper.getLevel().getEntitiesOfClass(ItemEntity.class, yorkie.getBoundingBox().inflate(2),
				item -> !item.isRemoved() && item.getItem().is(Items.BONE));
		helper.assertTrue(toys.size() == 1 && toys.getFirst().getItem().getCount() == 1,
				"Interrupted fetch did not preserve exactly one toy: " + toys.size());
		helper.succeed();
	}
}
