package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.block.ModBlocks;
import java.util.function.UnaryOperator;
import net.minecraft.core.BlockPos;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.Vec3;

final class ExpeditionCampScenarios {
	private ExpeditionCampScenarios() {
	}

	static void retreatAndRecall(GameTestHelper helper, UnaryOperator<MushroomYorkieEntity> roundTrip) {
		for (int x = 0; x <= 7; x++) {
			for (int z = 0; z <= 7; z++) {
				helper.setBlock(x, 0, z, Blocks.STONE);
			}
		}
		var level = helper.getLevel();
		var owner = SurvivalGameTestPlayers.createWithoutToyCleanup(helper);
		var guest = SurvivalGameTestPlayers.createWithoutToyCleanup(helper);
		var dog = helper.spawn(ModEntities.MUSHROOM_YORKIE, 5, 1, 5);
		var mat = new BlockPos(2, 1, 2);
		helper.setBlock(mat, ModBlocks.CAMP_MAT);
		owner.setPos(Vec3.atBottomCenterOf(helper.absolutePos(new BlockPos(6, 1, 2))));
		guest.setPos(Vec3.atBottomCenterOf(helper.absolutePos(new BlockPos(3, 1, 2))));
		dog.claimFor(owner);
		MushroomCampInteractions.markCamp(level, helper.absolutePos(mat), guest);
		helper.assertTrue(dog.expeditionCamp.anchor() == null, "A guest marked someone else's dog");
		MushroomCampInteractions.markCamp(level, helper.absolutePos(mat), owner);
		var anchor = dog.expeditionCamp.anchor();
		helper.assertTrue(anchor != null && anchor.pos().equals(helper.absolutePos(mat)), "The owner could not mark the mat");
		dog.hurtTime = 20;
		helper.startSequence()
				.thenWaitUntil(() -> helper.assertTrue(dog.isHoldingExpeditionShelter()
						&& dog.distanceToSqr(Vec3.atBottomCenterOf(anchor.pos())) <= 1, "Mushroom did not reach his marked shelter"))
				.thenExecute(() -> {
					var id = dog.getUUID();
					var restored = roundTrip.apply(dog);
					var position = restored.position();
					helper.assertTrue(restored.getUUID().equals(id) && restored.isOwnedBy(owner)
							&& restored.isHoldingExpeditionShelter() && anchor.equals(restored.expeditionCamp.anchor()),
							"Reopening dropped the camp, hold, owner or identity");
					helper.setBlock(mat, Blocks.AIR);
					helper.runAfterDelay(18, () -> {
						helper.assertTrue(restored.isHoldingExpeditionShelter() && restored.isAlive() && restored.position().distanceToSqr(position) < 2,
								"Removing the mat made Mushroom abandon his safe spot");
						owner.setPos(restored.getX() + 1, restored.getY(), restored.getZ());
						owner.interactOn(restored, InteractionHand.MAIN_HAND);
						helper.assertTrue(!restored.isHoldingExpeditionShelter() && !restored.isOrderedToSit(),
								"The owner could not recall Mushroom without changing the sit order");
						restored.discard();
						level.getServer().getPlayerList().remove(guest);
						level.getServer().getPlayerList().remove(owner);
						helper.succeed();
					});
				});
	}

	static void narrowCrossing(GameTestHelper helper) {
		int floor = 4;
		int feet = floor + 1;
		buildBridge(helper, floor);
		var level = helper.getLevel();
		var owner = SurvivalGameTestPlayers.createWithoutToyCleanup(helper);
		var dog = helper.spawn(ModEntities.MUSHROOM_YORKIE, 1, feet, 3);
		dog.claimFor(owner);
		owner.setPos(Vec3.atBottomCenterOf(helper.absolutePos(new BlockPos(7, feet, 3))));
		var safeBank = Vec3.atBottomCenterOf(helper.absolutePos(new BlockPos(1, feet, 3)));
		var entry = helper.absolutePos(new BlockPos(3, feet, 3));
		var towardBridge = Vec3.atBottomCenterOf(entry).subtract(safeBank).normalize();
		helper.assertTrue(MushroomExpeditionFooting.unsafeStep(level, helper.absolutePos(new BlockPos(2, feet, 3)), entry),
				"Narrow fixture did not have dangerous sides");
		helper.startSequence()
				.thenWaitUntil(() -> helper.assertTrue(dog.lastWarnedTrailStep != null, "No warning at the narrow crossing; dog="
						+ dog.position() + ", owner=" + owner.position() + ", entry=" + entry + ", path=" + dog.getNavigation().getPath()))
				.thenExecuteAfter(25, () -> {
					helper.assertTrue(dog.isAlive() && dog.getY() >= safeBank.y - 0.2
							&& dog.position().subtract(safeBank).dot(towardBridge) < 1.5,
							"Mushroom stepped out onto the narrow bridge at " + dog.position() + ", entry=" + entry);
					for (int x = 3; x <= 5; x++) {
						helper.setBlock(x, floor, 2, Blocks.STONE);
						helper.setBlock(x, floor, 4, Blocks.STONE);
					}
				})
				.thenWaitUntil(() -> helper.assertTrue(dog.distanceToSqr(owner) <= 4, "Mushroom did not use the widened path"))
				.thenExecute(() -> {
					dog.discard();
					level.getServer().getPlayerList().remove(owner);
					helper.succeed();
				});
	}

	static void stepOffMagmaWithoutMat(GameTestHelper helper, Block cover) {
		int floor = 2;
		int feet = floor + 1;
		for (int x = 1; x <= 7; x++) {
			for (int z = 1; z <= 7; z++) {
				helper.setBlock(x, floor, z, Blocks.NETHERRACK);
			}
		}
		helper.setBlock(4, floor, 4, Blocks.MAGMA_BLOCK);
		helper.setBlock(4, feet, 4, cover);
		helper.setBlock(5, feet, 4, Blocks.GRASS_BLOCK);
		var level = helper.getLevel();
		var owner = SurvivalGameTestPlayers.createWithoutToyCleanup(helper);
		owner.setPos(Vec3.atBottomCenterOf(helper.absolutePos(new BlockPos(7, feet, 7))));
		var dog = helper.spawn(ModEntities.MUSHROOM_YORKIE, 4, feet, 4);
		dog.claimFor(owner);
		dog.setHealth(4.0F);
		var identity = dog.getUUID();
		helper.startSequence()
				.thenWaitUntil(() -> helper.assertTrue(dog.isHoldingExpeditionShelter()
						&& MushroomExpeditionFooting.standable(level, dog, dog.blockPosition()),
						"Mushroom did not leave hot footing and find shelter before owning a mat"))
				.thenExecuteAfter(35, () -> {
					helper.assertTrue(dog.isAlive() && dog.isOwnedBy(owner) && dog.getUUID().equals(identity)
							&& !dog.isOrderedToSit() && dog.expeditionCamp.anchor() == null
							&& MushroomExpeditionFooting.standable(level, dog, dog.blockPosition()),
							"The original dog did not stay alive off the magma while the owner was away");
					dog.discard();
					level.getServer().getPlayerList().remove(owner);
					helper.succeed();
				});
	}

	static void borrowedLeadCrossing(GameTestHelper helper) {
		int floor = 4;
		int feet = floor + 1;
		buildBridge(helper, floor);
		var level = helper.getLevel();
		var owner = SurvivalGameTestPlayers.createWithoutToyCleanup(helper);
		var guest = SurvivalGameTestPlayers.createWithoutToyCleanup(helper);
		var dog = helper.spawn(ModEntities.MUSHROOM_YORKIE, 2, feet, 3);
		dog.claimFor(owner);
		dog.setHarness(true);
		owner.setPos(Vec3.atBottomCenterOf(helper.absolutePos(new BlockPos(1, feet, 3))));
		guest.setPos(Vec3.atBottomCenterOf(helper.absolutePos(new BlockPos(1, feet, 4))));
		guest.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.LEAD));
		guest.interactOn(dog, InteractionHand.MAIN_HAND);
		helper.assertTrue(dog.getLeashHolder() == guest, "The guest could not borrow the harnessed dog's lead");
		guest.setPos(Vec3.atBottomCenterOf(helper.absolutePos(new BlockPos(7, feet, 3))));
		var bank = Vec3.atBottomCenterOf(helper.absolutePos(new BlockPos(2, feet, 3)));
		var towardBridge = Vec3.atBottomCenterOf(helper.absolutePos(new BlockPos(3, feet, 3))).subtract(bank).normalize();
		helper.startSequence()
				.thenWaitUntil(() -> helper.assertTrue(dog.lastWarnedTrailStep != null, "Mushroom did not warn the guest at the bridge"))
				.thenExecuteAfter(25, () -> {
					helper.assertTrue(dog.isAlive() && dog.getY() >= bank.y - 0.2
							&& dog.position().subtract(bank).dot(towardBridge) < 0.5, "The borrowed lead pulled the dog onto the bridge");
					helper.assertTrue(dog.getLeashHolder() == guest && dog.isOwnedBy(owner), "The warning lost the lead or changed ownership");
					dog.discard();
					level.getServer().getPlayerList().remove(guest);
					level.getServer().getPlayerList().remove(owner);
					helper.succeed();
				});
	}

	private static void buildBridge(GameTestHelper helper, int floor) {
		for (int x = 0; x <= 7; x++) {
			for (int z = 2; z <= 4; z++) {
				helper.setBlock(x, floor, z, x < 3 || x > 5 || z == 3 ? Blocks.STONE : Blocks.AIR);
			}
		}
	}
}
