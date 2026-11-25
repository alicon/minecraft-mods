package dev.alicon.mushroomyorkie.mixin;

import dev.alicon.mushroomyorkie.item.ModItems;
import dev.alicon.mushroomyorkie.item.YorkieFetchToyStacks;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.player.Player;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Lets a player pick a Creative toy off the ground while keeping a single inventory original. */
@Mixin(ItemEntity.class)
public abstract class CreativeToyPickupMixin {
	// Let the toy clear the thrower's pickup area before walking over it can collect it.
	private static final int COLLECTION_DELAY_TICKS = 20;

	@Inject(method = "playerTouch", at = @At("HEAD"), cancellable = true)
	private void mushroomYorkie$collectCreativeToy(Player player, CallbackInfo callback) {
		ItemEntity item = (ItemEntity) (Object) this;
		var stack = item.getItem();
		if (!(stack.is(ModItems.YORKIE_BALL) || stack.is(ModItems.YORKIE_CHEW_TOY))
				|| !YorkieFetchToyStacks.isFreeCreativeCopy(stack)) {
			return;
		}
		callback.cancel();
		if (item.level() instanceof ServerLevel && !item.isRemoved() && item.getAge() >= COLLECTION_DELAY_TICKS) {
			player.take(item, stack.getCount());
			item.discard();
		}
	}
}
