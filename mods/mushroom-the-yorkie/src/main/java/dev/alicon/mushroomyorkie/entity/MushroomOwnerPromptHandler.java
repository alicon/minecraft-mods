package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.item.ModItems;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;

final class MushroomOwnerPromptHandler {
	private static final int FOOD_PROMPT_INTERVAL_TICKS = MushroomYorkieEntity.BARK_INTERVAL_TICKS * 3;

	private MushroomOwnerPromptHandler() {
	}

	static void tick(MushroomYorkieEntity yorkie, ServerLevel level) {
		tickTreatBark(yorkie);
		tickFoodPrompt(yorkie, level);
	}

	private static void tickTreatBark(MushroomYorkieEntity yorkie) {
		LivingEntity owner = yorkie.getOwner();
		boolean ownerHasTreat = yorkie.isTame() && owner != null && owner.isHolding(ModItems.YORKIE_TREAT);
		if (ownerHasTreat && !yorkie.isMushroomSleeping() && yorkie.tickCount % MushroomYorkieEntity.BARK_INTERVAL_TICKS == 0) {
			MushroomBehaviorDebugger.debug(yorkie, "treat_attention", "treat attention: owner is holding a Yorkie treat", false);
			yorkie.bark();
		}
	}

	private static void tickFoodPrompt(MushroomYorkieEntity yorkie, ServerLevel level) {
		if (!(yorkie.getOwner() instanceof Player owner)
				|| !yorkie.isTame()
				|| yorkie.isOrderedToSit()
				|| yorkie.isMushroomSleeping()
				|| yorkie.tickCount % FOOD_PROMPT_INTERVAL_TICKS != 0) {
			return;
		}

		boolean hasAnyBowl = MushroomDomesticLocator.hasAnyBowl(level, yorkie.blockPosition());
		boolean hasFoodBowl = MushroomDomesticLocator.hasFoodBowl(level, yorkie.blockPosition());
		long day = MushroomYorkieEntity.currentDay(level);
		if (!DomesticCarePolicy.shouldAskForFood(yorkie.needs.hunger(), hasAnyBowl, hasFoodBowl, yorkie.domestic.ateFoodToday(day))) {
			return;
		}

		yorkie.whine();
		owner.displayClientMessage(Component.translatable("message.mushroom_yorkie.food_bowl_empty"), true);
		MushroomBehaviorDebugger.debug(yorkie, "food_prompt", "domestic care: food bowl is empty", true);
	}
}
