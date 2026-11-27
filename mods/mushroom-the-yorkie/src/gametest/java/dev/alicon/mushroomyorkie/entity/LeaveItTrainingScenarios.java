package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.item.ModItems;
import java.util.function.UnaryOperator;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.Vec3;

final class LeaveItTrainingScenarios {
	private LeaveItTrainingScenarios() {
	}

	static void train(GameTestHelper helper, UnaryOperator<MushroomYorkieEntity> roundTrip) {
		for (int x = 0; x < 16; x++) {
			for (int z = 0; z < 16; z++) {
				helper.setBlock(x, 0, z, Blocks.STONE);
			}
		}
		var owner = SurvivalGameTestPlayers.createWithoutToyCleanup(helper);
		var guest = SurvivalGameTestPlayers.createWithoutToyCleanup(helper);
		var dog = helper.spawn(ModEntities.MUSHROOM_YORKIE, 5, 1, 3);
		var otherDog = helper.spawn(ModEntities.MUSHROOM_YORKIE, 1, 1, 14);
		otherDog.claimFor(guest);
		otherDog.setOrderedToSit(true);
		move(helper, owner, 4.5, 3.5);
		move(helper, guest, 9.5, 14.5);
		feed(dog, owner);
		helper.assertTrue(dog.isOwnedBy(owner) && owner.getInventory().contains(new ItemStack(ModItems.FIELD_GUIDE)),
				"Survival taming did not give the owner a guide");
		helper.assertTrue(dog.leaveItTraining.paws().isEmpty(), "An ordinary treat earned practice credit");
		move(helper, owner, 2.5, 3.5);
		var first = squirrel(helper, 9, 3);
		helper.startSequence()
				.thenWaitUntil(() -> assertChasing(helper, dog, first))
				.thenExecute(() -> {
					cue(guest);
					helper.assertTrue(!dog.leaveItTraining.suppressesBarking(), "A guest called the owner's dog off a squirrel");
					cue(owner);
					helper.assertTrue(dog.leaveItTraining.suppressesBarking(), "The owner cue did not interrupt the chase");
				})
				.thenWaitUntil(() -> assertReturned(helper, dog, owner))
				.thenExecuteAfter(205, () -> {
					helper.assertTrue(!dog.leaveItTraining.suppressesBarking() && dog.leaveItTraining.paws().isEmpty(),
							"An unrewarded cue failed to expire or awarded a paw");
				})
				.thenWaitUntil(() -> assertChasing(helper, dog, first))
				.thenExecute(() -> cue(owner))
				.thenWaitUntil(() -> assertReturned(helper, dog, owner))
				.thenExecuteAfter(2, () -> {
					dog.setHarness(true);
					move(helper, guest, 2.5, 4.5);
					guest.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.LEAD));
					guest.interactOn(dog, InteractionHand.MAIN_HAND);
					helper.assertTrue(dog.getLeashHolder() == guest, "The guest could not borrow the lead");
					feed(dog, guest);
					helper.assertTrue(dog.getLeashHolder() == guest && dog.isOwnedBy(owner)
							&& dog.leaveItTraining.paws().isEmpty(), "A guest's treat changed progress, lead or owner");
					guest.setItemInHand(InteractionHand.MAIN_HAND, ItemStack.EMPTY);
					guest.interactOn(dog, InteractionHand.MAIN_HAND);
					helper.assertTrue(dog.getLeashHolder() == null, "The guest could not return the borrowed lead");
					feed(dog, owner);
					helper.assertTrue(dog.leaveItTraining.paws().size() == 1
							&& dog.leaveItTraining.paws().getFirst().squirrel().equals(first.getUUID()),
							"The first reward was not credited: paws=" + dog.leaveItTraining.paws()
									+ ", waiting=" + dog.leaveItTraining.waitingForTreat() + ", distance=" + dog.distanceTo(owner));
				})
				.thenWaitUntil(() -> assertChasing(helper, dog, first))
				.thenExecute(() -> cue(owner))
				.thenWaitUntil(() -> assertReturned(helper, dog, owner))
				.thenExecuteAfter(2, () -> {
					feed(dog, owner);
					helper.assertTrue(dog.leaveItTraining.paws().size() == 1
							&& otherDog.leaveItTraining.paws().isEmpty(), "Repeating the same squirrel or reading another dog copied a paw");
					first.discard();
					practiceAgain(helper, dog, owner, guest, otherDog, roundTrip);
				});
	}

	private static void practiceAgain(GameTestHelper helper, MushroomYorkieEntity dog, ServerPlayer owner,
			ServerPlayer guest, MushroomYorkieEntity otherDog, UnaryOperator<MushroomYorkieEntity> roundTrip) {
		var second = squirrel(helper, 9, 3);
		helper.startSequence()
				.thenWaitUntil(() -> assertChasing(helper, dog, second))
				.thenExecute(() -> cue(owner))
				.thenWaitUntil(() -> assertReturned(helper, dog, owner))
				.thenExecuteAfter(2, () -> {
					feed(dog, owner);
					var paws = dog.leaveItTraining.paws();
					helper.assertTrue(paws.size() == 2 && paws.getLast().squirrel().equals(second.getUUID()),
							"Practice with a distinct distraction did not earn the second paw");
					second.discard();
					var dogId = dog.getUUID();
					var restored = roundTrip.apply(dog);
					helper.assertTrue(restored.getUUID().equals(dogId) && restored.isOwnedBy(owner)
							&& restored.leaveItTraining.paws().equals(paws)
							&& !restored.leaveItTraining.suppressesBarking()
							&& MushroomFieldGuide.pages(restored).openPage() == 2,
							"Save/reload did not restore both paws and the next lesson");
					walkTrail(helper, restored, owner, guest, otherDog);
				});
	}

	private static void walkTrail(GameTestHelper helper, MushroomYorkieEntity dog, ServerPlayer owner,
			ServerPlayer guest, MushroomYorkieEntity otherDog) {
		move(helper, owner, 2.5, 11.5);
		dog.setPos(helper.absoluteVec(new Vec3(2.1, 1, 11.5)));
		dog.getNavigation().stop();
		cue(owner);
		helper.assertTrue(dog.leaveItTraining.suppressesBarking(), "Two practiced paws did not let the owner cue heel");
		cue(owner);
		helper.assertTrue(dog.leaveItTraining.paws().size() == 2, "Starting and releasing heel without walking earned a paw");
		cue(owner);
		var third = squirrel(helper, 6, 9);
		for (int tick = 1; tick <= 30; tick++) {
			final double x = 2.5 + Math.max(0, tick - 8) * 0.25;
			helper.runAfterDelay(tick, () -> {
				move(helper, owner, x, 11.5);
				helper.assertTrue(dog.distanceToSqr(owner) <= 16 && dog.leaveItTraining.suppressesBarking(),
						"Dog broke heel on the walk at " + dog.position());
			});
		}
		helper.startSequence()
				.thenExecuteAfter(31, () -> {
					cue(owner);
					helper.assertTrue(!dog.leaveItTraining.suppressesBarking() && dog.leaveItTraining.paws().size() == 3
							&& dog.leaveItTraining.paws().getLast().squirrel().equals(third.getUUID())
							&& MushroomFieldGuide.pages(dog).openPage() == 3
							&& otherDog.leaveItTraining.paws().isEmpty(), "The field job did not record the third paw and release Mushroom");
				})
				.thenWaitUntil(() -> assertChasing(helper, dog, third))
				.thenExecute(() -> {
					third.discard();
					trainSecondDog(helper, dog, owner, guest, otherDog);
				});
	}

	private static void trainSecondDog(GameTestHelper helper, MushroomYorkieEntity dog, ServerPlayer owner,
			ServerPlayer guest, MushroomYorkieEntity otherDog) {
		move(helper, guest, 2.5, 13.5);
		otherDog.setOrderedToSit(false);
		otherDog.setPos(helper.absoluteVec(new Vec3(5.5, 1, 13.5)));
		dog.setOrderedToSit(true);
		var otherSquirrel = squirrel(helper, 9, 13);
		var firstDogPaws = dog.leaveItTraining.paws();
		helper.startSequence()
				.thenWaitUntil(() -> assertChasing(helper, otherDog, otherSquirrel))
				.thenExecute(() -> cue(guest))
				.thenWaitUntil(() -> assertReturned(helper, otherDog, guest))
				.thenExecuteAfter(2, () -> {
					feed(otherDog, guest);
					var paws = otherDog.leaveItTraining.paws();
					helper.assertTrue(paws.size() == 1 && paws.getFirst().squirrel().equals(otherSquirrel.getUUID())
							&& dog.leaveItTraining.paws().equals(firstDogPaws), "Two dogs did not earn and keep independent progress");
					otherSquirrel.discard();
					dog.discard();
					otherDog.discard();
					helper.getLevel().getServer().getPlayerList().remove(guest);
					helper.getLevel().getServer().getPlayerList().remove(owner);
					helper.succeed();
				});
	}

	private static SquirrelEntity squirrel(GameTestHelper helper, int x, int z) {
		SquirrelEntity squirrel = helper.spawn(ModEntities.SQUIRREL, x, 1, z);
		squirrel.setNoAi(true);
		return squirrel;
	}

	private static void move(GameTestHelper helper, ServerPlayer player, double x, double z) {
		player.setPos(helper.absoluteVec(new Vec3(x, 1, z)));
		player.setOnGround(true);
	}

	private static void feed(MushroomYorkieEntity dog, ServerPlayer player) {
		player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(ModItems.YORKIE_TREAT));
		player.interactOn(dog, InteractionHand.MAIN_HAND);
	}

	private static void cue(ServerPlayer player) {
		player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(ModItems.FIELD_GUIDE));
		player.setShiftKeyDown(true);
		player.getMainHandItem().use(player.level(), player, InteractionHand.MAIN_HAND);
		player.setShiftKeyDown(false);
	}

	private static void assertChasing(GameTestHelper helper, MushroomYorkieEntity dog, SquirrelEntity squirrel) {
		var target = dog.getNavigation().getTargetPos();
		helper.assertTrue(squirrel.blockPosition().equals(target) && !dog.getNavigation().isDone()
						&& !dog.leaveItTraining.suppressesBarking(),
				"Free chase did not reach squirrel at " + squirrel.blockPosition() + ", dog=" + dog.position() + ", target=" + target);
	}

	private static void assertReturned(GameTestHelper helper, MushroomYorkieEntity dog, ServerPlayer owner) {
		helper.assertTrue(dog.leaveItTraining.waitingForTreat() && dog.distanceToSqr(owner) <= 9,
				"Mushroom did not return beside the owner, dog=" + dog.position() + ", owner=" + owner.position());
	}
}
