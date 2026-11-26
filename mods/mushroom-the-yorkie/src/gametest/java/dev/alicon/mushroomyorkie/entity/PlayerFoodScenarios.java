package dev.alicon.mushroomyorkie.entity;

import com.google.gson.Gson;
import dev.alicon.mushroomyorkie.item.ModItems;
import dev.alicon.mushroomyorkie.pet.PetNeeds;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Objects;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;

final class PlayerFoodScenarios {
	private PlayerFoodScenarios() {
	}

	static void feed(GameTestHelper helper, boolean leashed) {
		var owner = SurvivalGameTestPlayers.createWithoutToyCleanup(helper);
		var guest = SurvivalGameTestPlayers.createWithoutToyCleanup(helper);
		var dog = helper.spawn(ModEntities.MUSHROOM_YORKIE, 2, 1, 2);
		dog.setNoAi(true);
		owner.setPos(dog.getX() - 1, dog.getY(), dog.getZ());
		guest.setPos(dog.getX() + 1, dog.getY(), dog.getZ());
		dog.claimFor(owner);
		var players = helper.getLevel().getServer().getPlayerList();
		try (var reader = new InputStreamReader(Objects.requireNonNull(
				PlayerFoodScenarios.class.getResourceAsStream("/mushroom-food-cases.json")), StandardCharsets.UTF_8)) {
			if (leashed) {
				owner.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(ModItems.YORKIE_HARNESS));
				owner.interactOn(dog, InteractionHand.MAIN_HAND);
				owner.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.LEAD));
				owner.interactOn(dog, InteractionHand.MAIN_HAND);
				helper.assertTrue(dog.getLeashHolder() == owner, "Food fixture could not attach the owner's lead");
			}
			for (var example : new Gson().fromJson(reader, Example[].class)) {
				if (example.leashed() != leashed) {
					continue;
				}
				var player = example.owner() ? owner : guest;
				player.setGameMode(GameType.byName(example.mode()));
				dog.needs = new PetNeeds(65, 0, 80, 80);
				float beforeHealth = dog.getMaxHealth() - example.missingHealth();
				dog.setHealth(beforeHealth);
				var food = switch (example.item()) {
					case "apple" -> Items.APPLE;
					case "bread" -> Items.BREAD;
					case "carrot" -> Items.CARROT;
					case "cooked_beef" -> Items.COOKED_BEEF;
					default -> throw new IllegalArgumentException("Unknown test food " + example.item());
				};
				player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(food, 2));
				player.interactOn(dog, InteractionHand.MAIN_HAND);
				helper.assertTrue(dog.getLeashHolder() == (leashed ? owner : null), example.id() + " changed the lead holder");
				helper.assertTrue(dog.getHealth() == beforeHealth + example.healed(), example.id() + " health");
				helper.assertTrue(player.getMainHandItem().getCount() == 2 - example.spent(), example.id() + " item count");
				helper.assertTrue(example.owner() ? dog.needs.hunger() < 65 : dog.needs.hunger() == 65,
						example.id() + " hunger");
				helper.assertTrue(dog.isOwnedBy(owner) && !dog.isOrderedToSit(), example.id() + " changed owner or sit order");
			}
		} catch (IOException error) {
			throw new IllegalStateException("Could not read shared feeding examples", error);
		} finally {
			dog.discard();
			players.remove(guest);
			players.remove(owner);
		}
		helper.succeed();
	}

	private record Example(String id, String item, String mode, int missingHealth, float healed, int spent,
			boolean owner, boolean leashed) {}
}
