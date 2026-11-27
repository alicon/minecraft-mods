package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.item.ModItems;
import net.minecraft.network.chat.Component;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.tags.DamageTypeTags;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.damagesource.DamageTypes;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

final class MushroomExpeditionEquipment {
	private MushroomExpeditionEquipment() {
	}

	static InteractionResult handle(MushroomYorkieEntity dog, Player player, InteractionHand hand, ItemStack held) {
		ItemStack vest = vest(dog);
		if (isVest(held)) {
			if (!dog.isOwnedBy(player)) {
				return InteractionResult.FAIL;
			}
			if (!dog.level().isClientSide()) {
				equip(dog, player, hand, held, vest);
			}
			return InteractionResult.SUCCESS;
		}
		if (!isVest(vest)) {
			return null;
		}
		boolean scute = held.is(Items.ARMADILLO_SCUTE);
		boolean leather = held.is(Items.LEATHER) && vest.is(ModItems.PADDED_VEST) && vest.isDamaged();
		boolean shears = held.is(Items.SHEARS);
		if (!scute && !leather && !shears) {
			return null;
		}
		if (!dog.isOwnedBy(player)) {
			return InteractionResult.FAIL;
		}
		if (dog.level().isClientSide()) {
			return InteractionResult.SUCCESS;
		}
		if (shears) {
			removeVest(dog, player);
			notice(player, "vest_removed");
		} else if (scute && vest.is(ModItems.PADDED_VEST)) {
			upgrade(dog, player, hand, held, vest);
		} else if (vest.isDamaged()) {
			int repairedDamage = Math.max(0, vest.getDamageValue() - (scute ? 12 : 8));
			setDamage(dog, vest, repairedDamage);
			dog.useInteractionItem(player, hand, held);
			notice(player, "vest_repaired");
		} else {
			notice(player, "vest_intact");
		}
		return InteractionResult.SUCCESS;
	}

	private static void equip(MushroomYorkieEntity dog, Player player, InteractionHand hand, ItemStack held, ItemStack vest) {
		if (!dog.hasHarness()) {
			notice(player, "vest_needs_harness");
		} else if (!vest.isEmpty()) {
			notice(player, "vest_already_on");
		} else {
			putOn(dog, held.copyWithCount(1));
			dog.useInteractionItem(player, hand, held);
			dog.playSound(SoundEvents.ARMOR_EQUIP_LEATHER.value(), 0.6F, 1.2F);
			notice(player, "vest_equipped");
		}
	}

	private static void upgrade(MushroomYorkieEntity dog, Player player, InteractionHand hand, ItemStack held, ItemStack vest) {
		ItemStack plated = new ItemStack(ModItems.PLATED_VEST);
		plated.setDamageValue(vest.getDamageValue());
		putOn(dog, plated);
		dog.useInteractionItem(player, hand, held);
		notice(player, "vest_plated");
	}

	static void removeVest(MushroomYorkieEntity dog, Player player) {
		ItemStack vest = vest(dog);
		if (isVest(vest)) {
			dog.setItemSlot(EquipmentSlot.BODY, ItemStack.EMPTY);
			if (!player.addItem(vest)) {
				player.drop(vest, false);
			}
		}
	}

	static float absorption(MushroomYorkieEntity dog, DamageSource source, float damage) {
		ItemStack vest = vest(dog);
		if (!dog.hasHarness() || !isVest(vest) || source.is(DamageTypeTags.BYPASSES_INVULNERABILITY)) {
			return 0.0F;
		}
		if (!source.is(DamageTypeTags.IS_PROJECTILE) && !source.is(DamageTypeTags.IS_EXPLOSION)
				&& !source.is(DamageTypeTags.IS_FALL) && !source.is(DamageTypes.MOB_ATTACK)
				&& !source.is(DamageTypes.PLAYER_ATTACK)) {
			return 0.0F;
		}
		float coverage = vest.is(ModItems.PLATED_VEST) ? 0.5F : 0.3F;
		int remaining = Math.max(0, vest.getMaxDamage() - vest.getDamageValue());
		return Math.min(Math.max(0, damage) * coverage, remaining);
	}

	static void wear(MushroomYorkieEntity dog, float absorbed) {
		ItemStack vest = vest(dog);
		if (absorbed <= 0.0F || !isVest(vest)) {
			return;
		}
		boolean alreadyCracked = cracked(vest);
		int damage = Math.min(vest.getMaxDamage(), vest.getDamageValue() + (int) Math.ceil(absorbed));
		setDamage(dog, vest, damage);
		if (damage == vest.getMaxDamage()) {
			dog.playSound(SoundEvents.WOLF_ARMOR_CRACK, 0.7F, 0.8F);
		}
		if (dog.getOwner() instanceof Player owner) {
			if (damage == vest.getMaxDamage()) {
				notice(owner, "vest_worn_out");
			} else if (!alreadyCracked && cracked(vest(dog))) {
				notice(owner, "vest_cracked");
			}
		}
	}

	static ItemStack vest(MushroomYorkieEntity dog) {
		return dog.getItemBySlot(EquipmentSlot.BODY);
	}

	static boolean isVest(ItemStack stack) {
		return stack.is(ModItems.PADDED_VEST) || stack.is(ModItems.PLATED_VEST);
	}

	static boolean cracked(ItemStack vest) {
		return isVest(vest) && 2 * vest.getDamageValue() >= vest.getMaxDamage();
	}

	private static void setDamage(MushroomYorkieEntity dog, ItemStack vest, int damage) {
		ItemStack updated = vest.copy();
		updated.setDamageValue(damage);
		dog.setItemSlot(EquipmentSlot.BODY, updated);
	}

	private static void putOn(MushroomYorkieEntity dog, ItemStack vest) {
		dog.setItemSlot(EquipmentSlot.BODY, vest);
		dog.setDropChance(EquipmentSlot.BODY, 2.0F);
	}

	private static void notice(Player player, String key) {
		player.displayClientMessage(Component.translatable("message.mushroom_yorkie." + key), true);
	}
}
