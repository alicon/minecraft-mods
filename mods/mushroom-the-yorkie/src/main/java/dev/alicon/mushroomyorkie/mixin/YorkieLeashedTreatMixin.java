package dev.alicon.mushroomyorkie.mixin;

import dev.alicon.mushroomyorkie.entity.MushroomFeedingInteractions;
import dev.alicon.mushroomyorkie.entity.MushroomYorkieEntity;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.player.Player;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

@Mixin(Mob.class)
abstract class YorkieLeashedTreatMixin {
	@Inject(method = "interact", at = @At("HEAD"), cancellable = true)
	private void mushroom$feedBeforeLeashRelease(Player player, InteractionHand hand,
			CallbackInfoReturnable<InteractionResult> callback) {
		if ((Object) this instanceof MushroomYorkieEntity yorkie) {
			var result = MushroomFeedingInteractions.feedLeashHolderTreat(yorkie, player, hand);
			if (result.consumesAction()) {
				callback.setReturnValue(result);
			}
		}
	}
}
