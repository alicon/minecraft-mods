package dev.alicon.mushroomyorkie.entity;

import com.google.gson.Gson;
import dev.alicon.mushroomyorkie.item.ModItems;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Objects;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.GameType;

/** Run the same item-use examples as the Bedrock player probe through the Java player interaction. */
final class TreatScenarios {
	private TreatScenarios() {
	}

	static void feed(GameTestHelper helper) {
		var owner = SurvivalGameTestPlayers.createWithoutToyCleanup(helper);
		var dog = helper.spawn(ModEntities.MUSHROOM_YORKIE, 2, 1, 2);
		owner.setPos(dog.getX() + 1, dog.getY(), dog.getZ());
		dog.claimFor(owner);
		try (var reader = new InputStreamReader(Objects.requireNonNull(
				TreatScenarios.class.getResourceAsStream("/mushroom-treat-cases.json")), StandardCharsets.UTF_8)) {
			for (var example : new Gson().fromJson(reader, Treat[].class)) {
				owner.setGameMode(GameType.byName(example.mode()));
				dog.setHealth(dog.getMaxHealth() - example.missingHealth());
				owner.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(ModItems.YORKIE_TREAT, example.treatsBefore()));
				owner.interactOn(dog, InteractionHand.MAIN_HAND);
				helper.assertTrue(dog.getHealth() == dog.getMaxHealth() - example.missingAfter(), "Health after " + example);
				helper.assertTrue(owner.getMainHandItem().getCount() == example.treatsAfter(), "Hand after " + example);
				helper.assertTrue(dog.isOwnedBy(owner) && !dog.isOrderedToSit(), "Ownership or sit order changed after " + example);
			}
		} catch (IOException error) {
			throw new IllegalStateException("Could not read shared treat examples", error);
		} finally {
			dog.discard();
			helper.getLevel().getServer().getPlayerList().remove(owner);
		}
		helper.succeed();
	}

	private record Treat(String mode, int missingHealth, int missingAfter, int treatsBefore, int treatsAfter) {}
}
