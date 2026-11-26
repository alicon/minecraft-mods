package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.block.ModBlocks;
import dev.alicon.mushroomyorkie.pet.PetNeeds;
import net.minecraft.gametest.framework.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.world.level.block.Blocks;

/** Emergency bowl care must coexist with sleep, sit orders, and the daily meal limit. */
public final class DomesticCareGameTests {
	/** Both editions exercise the same feeding and inventory examples. */
	@GameTest(template = "fabric-gametest-api-v1:empty")
	public void feedsTreatsAcrossEditions(GameTestHelper helper) {
		TreatScenarios.feed(helper);
	}

	/** A sleeping, starving pet may eat; it cannot ignore sitting or eat a second daily meal. */
	@GameTest(template = "fabric-gametest-api-v1:empty")
	public void urgentMealWakesSleepingPet(GameTestHelper helper) {
		MushroomYorkieEntity yorkie = helper.spawn(ModEntities.MUSHROOM_YORKIE, 3, 2, 3);
		yorkie.setNoAi(true);
		var owner = helper.makeMockServerPlayerInLevel();
		owner.setPos(yorkie.getX() - 2, yorkie.getY(), yorkie.getZ());
		yorkie.claimFor(owner);
		yorkie.needs = new PetNeeds(100, 10, 80, 80);
		helper.setBlock(3, 1, 3, Blocks.STONE);
		yorkie.setOnGround(true);
		yorkie.setSleeping(true);
		helper.assertTrue(yorkie.isMushroomSleeping(), "Urgent meal fixture did not start asleep");
		helper.setBlock(4, 2, 3, ModBlocks.DOG_FOOD_BOWL);
		DomesticCareGoal urgent = new DomesticCareGoal(yorkie, true);
		yorkie.setMushroomOrderedToSit(true);
		helper.assertTrue(!urgent.canUse(), "Urgent feeding ignored the explicit sit order");
		yorkie.setMushroomOrderedToSit(false);
		helper.assertTrue(urgent.canUse(), "Starving sleeping pet did not accept an available meal");
		urgent.start();
		urgent.tick();
		helper.assertTrue(!yorkie.isMushroomSleeping(), "Urgent meal did not wake the pet");
		helper.assertTrue(yorkie.needs.hunger() < 100, "Urgent meal did not feed the pet");
		urgent.stop();
		yorkie.needs = new PetNeeds(100, 10, 80, 80);
		helper.setBlock(4, 2, 3, ModBlocks.DOG_FOOD_BOWL);
		helper.assertTrue(!new DomesticCareGoal(yorkie, true).canUse(), "Urgent care bypassed the daily meal limit");
		helper.succeed();
	}
}
