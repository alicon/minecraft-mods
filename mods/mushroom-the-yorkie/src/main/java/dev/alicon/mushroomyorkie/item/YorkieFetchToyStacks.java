package dev.alicon.mushroomyorkie.item;

import net.minecraft.core.component.DataComponents;
import net.minecraft.util.Unit;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.item.ItemStack;

/** Distinguishes a consumed toy from the free projectile copy made by a creative throw. */
public final class YorkieFetchToyStacks {
	private YorkieFetchToyStacks() {
	}

	/**
	 * Copies one item without changing its original. Vanilla's intangible-projectile marker
	 * persists with the thrown/carried stack, so later owner mode changes cannot change custody.
	 * A survival throw consumes a physical inventory item and therefore clears an inherited marker.
	 */
	public static ItemStack thrownCopy(ItemStack original, boolean creative) {
		ItemStack thrown = original.copyWithCount(1);
		if (creative) {
			thrown.set(DataComponents.INTANGIBLE_PROJECTILE, Unit.INSTANCE);
		} else {
			thrown.remove(DataComponents.INTANGIBLE_PROJECTILE);
		}
		return thrown;
	}

	/** Free creative copies are play props; returning or dropping them would duplicate the retained original. */
	public static boolean isFreeCreativeCopy(ItemStack stack) {
		return stack.has(DataComponents.INTANGIBLE_PROJECTILE);
	}

	/** Clear free copies before vanilla death loot, whose equipment chances can be modified by enchantments. */
	public static void discardFreeCopyOnDeath(LivingEntity carrier) {
		if (isFreeCreativeCopy(carrier.getMainHandItem())) {
			carrier.setItemSlot(EquipmentSlot.MAINHAND, ItemStack.EMPTY);
		}
	}
}
