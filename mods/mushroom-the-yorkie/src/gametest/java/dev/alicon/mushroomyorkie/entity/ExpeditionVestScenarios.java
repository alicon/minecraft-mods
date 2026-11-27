package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.item.ModItems;
import java.util.function.BiConsumer;
import java.util.function.UnaryOperator;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

final class ExpeditionVestScenarios {
	private ExpeditionVestScenarios() {
	}

	static void armor(GameTestHelper helper, UnaryOperator<MushroomYorkieEntity> roundTrip,
			BiConsumer<MushroomYorkieEntity, DamageSource> hit) {
		var owner = SurvivalGameTestPlayers.createWithoutToyCleanup(helper);
		var guest = SurvivalGameTestPlayers.createWithoutToyCleanup(helper);
		var dog = helper.spawn(ModEntities.MUSHROOM_YORKIE, 2, 1, 2);
		var players = helper.getLevel().getServer().getPlayerList();
		try {
			dog.claimFor(owner);
			owner.setPos(dog.getX() - 1, dog.getY(), dog.getZ());
			guest.setPos(dog.getX() + 1, dog.getY(), dog.getZ());
			use(owner, dog, ModItems.PADDED_VEST);
			helper.assertTrue(!dog.hasExpeditionVest() && owner.getMainHandItem().is(ModItems.PADDED_VEST), "Mount consumed a vest without a harness");

			use(owner, dog, ModItems.YORKIE_HARNESS);
			use(guest, dog, ModItems.PADDED_VEST);
			helper.assertTrue(!dog.hasExpeditionVest() && guest.getMainHandItem().is(ModItems.PADDED_VEST), "Guest equipped an owner's dog");
			use(owner, dog, ModItems.PADDED_VEST);
			helper.assertTrue(dog.hasExpeditionVest() && owner.getMainHandItem().isEmpty(), "Owner did not equip exactly one vest");

			var sources = helper.getLevel().damageSources();
			float maxHealth = dog.getMaxHealth();
			hit.accept(dog, sources.fall());
			helper.assertTrue(dog.getHealth() > maxHealth - 4 && dog.getHealth() < maxHealth, "Padding did not partially absorb the impact");
			int worn = MushroomExpeditionEquipment.vest(dog).getDamageValue();
			helper.assertTrue(worn > 0, "Absorbed impact did not wear the vest");
			dog.invulnerableTime = 0;
			dog.setHealth(maxHealth);
			hit.accept(dog, sources.lava());
			helper.assertTrue(dog.getHealth() == maxHealth - 4 && MushroomExpeditionEquipment.vest(dog).getDamageValue() == worn,
					"The vest absorbed lava damage");

			use(guest, dog, Items.ARMADILLO_SCUTE);
			helper.assertTrue(!dog.hasScutePlates() && guest.getMainHandItem().is(Items.ARMADILLO_SCUTE), "Guest changed the dog's vest");
			use(owner, dog, Items.ARMADILLO_SCUTE);
			helper.assertTrue(dog.hasScutePlates() && owner.getMainHandItem().isEmpty()
					&& MushroomExpeditionEquipment.vest(dog).getDamageValue() == worn, "Adding plates failed to preserve the vest's wear");

			var uuid = dog.getUUID();
			dog = roundTrip.apply(dog);
			helper.assertTrue(dog.getUUID().equals(uuid) && dog.isOwnedBy(owner) && dog.hasScutePlates()
					&& MushroomExpeditionEquipment.vest(dog).getDamageValue() == worn, "Reload changed the dog, its owner, or its equipment");
			var vest = MushroomExpeditionEquipment.vest(dog);
			vest.setDamageValue(vest.getMaxDamage() - 1);
			dog.invulnerableTime = 0;
			dog.setHealth(maxHealth);
			hit.accept(dog, sources.fall());
			helper.assertTrue(dog.isExpeditionVestCracked() && MushroomExpeditionEquipment.vest(dog).getDamageValue() == vest.getMaxDamage(),
					"The final impact should visibly wear out the vest");

			dog = roundTrip.apply(dog);
			dog.invulnerableTime = 0;
			dog.setHealth(maxHealth);
			hit.accept(dog, sources.fall());
			helper.assertTrue(dog.getHealth() == maxHealth - 4, "A reloaded worn-out vest protected the dog");
			use(owner, dog, Items.ARMADILLO_SCUTE);
			var repaired = MushroomExpeditionEquipment.vest(dog);
			helper.assertTrue(repaired.getDamageValue() == repaired.getMaxDamage() - 12 && owner.getMainHandItem().isEmpty(),
					"A scute did not repair a worn-out vest");
			use(guest, dog, Items.SHEARS);
			helper.assertTrue(dog.hasScutePlates(), "Guest removed the vest");
			MushroomHarnessInteractions.removeHarness(dog, owner);
			helper.assertTrue(!dog.hasHarness() && MushroomExpeditionEquipment.vest(dog).isEmpty()
					&& owner.getInventory().countItem(ModItems.PLATED_VEST) == 1, "Removing the harness did not return exactly one vest");
		} finally {
			dog.discard();
			players.remove(guest);
			players.remove(owner);
		}
		helper.succeed();
	}

	private static void use(Player player, MushroomYorkieEntity dog, Item item) {
		player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(item));
		player.interactOn(dog, InteractionHand.MAIN_HAND);
	}
}
