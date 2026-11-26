package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.item.ModItems;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.level.ItemLike;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

final class DaycareScenarios {
	private DaycareScenarios() {
	}

	static void shareLeads(GameTestHelper helper) {
		var players = helper.getLevel().getServer().getPlayerList();
		var firstOwner = SurvivalGameTestPlayers.createWithoutToyCleanup(helper);
		var secondOwner = SurvivalGameTestPlayers.createWithoutToyCleanup(helper);
		var firstDog = helper.spawn(ModEntities.MUSHROOM_YORKIE, 2, 1, 2);
		var secondDog = helper.spawn(ModEntities.MUSHROOM_YORKIE, 4, 1, 2);
		try {
			firstOwner.setPos(firstDog.getX() - 1, firstDog.getY(), firstDog.getZ());
			secondOwner.setPos(secondDog.getX() + 1, secondDog.getY(), secondDog.getZ());

			use(firstOwner, firstDog, ModItems.YORKIE_TREAT);
			helper.assertTrue(firstDog.isOwnedBy(firstOwner) && firstOwner.getMainHandItem().isEmpty(),
					"First player could not adopt their Yorkie");
			use(firstOwner, secondDog, ModItems.YORKIE_TREAT);
			helper.assertTrue(!secondDog.isTame() && firstOwner.getMainHandItem().is(ModItems.YORKIE_TREAT),
					"First player could adopt an extra Yorkie");
			use(secondOwner, secondDog, ModItems.YORKIE_TREAT);
			helper.assertTrue(secondDog.isOwnedBy(secondOwner) && secondOwner.getMainHandItem().isEmpty(),
					"Second player could not adopt their own Yorkie");

			assertGuestLead(helper, firstDog, firstOwner, secondOwner);
			assertGuestLead(helper, secondDog, secondOwner, firstOwner);
		} finally {
			firstDog.discard();
			secondDog.discard();
			players.remove(firstOwner);
			players.remove(secondOwner);
		}
		helper.succeed();
	}

	private static void assertGuestLead(GameTestHelper helper, MushroomYorkieEntity dog, ServerPlayer owner, ServerPlayer guest) {
		guest.setPos(dog.getX(), dog.getY(), dog.getZ() + 1.5);
		owner.setPos(dog.getX() - 1.5, dog.getY(), dog.getZ());
		use(guest, dog, Items.LEAD);
		helper.assertTrue(!dog.isLeashed() && guest.getMainHandItem().is(Items.LEAD), "Guest could leash without a harness");
		use(owner, dog, ModItems.YORKIE_HARNESS);
		helper.assertTrue(dog.hasHarness() && owner.getMainHandItem().isEmpty(), "Owner could not equip the harness");
		use(guest, dog, Items.LEAD);
		helper.assertTrue(dog.getLeashHolder() == guest && guest.getMainHandItem().isEmpty(), "Guest could not attach a lead");
		guest.interactOn(dog, InteractionHand.MAIN_HAND);
		helper.assertTrue(!dog.isLeashed() && dog.hasHarness(), "Guest could not return the lead with the harness still equipped");
		helper.assertTrue(dog.isOwnedBy(owner) && !dog.isOrderedToSit(), "Guest changed ownership or sit order");
	}

	private static void use(ServerPlayer player, MushroomYorkieEntity dog, ItemLike item) {
		player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(item));
		player.interactOn(dog, InteractionHand.MAIN_HAND);
	}
}
