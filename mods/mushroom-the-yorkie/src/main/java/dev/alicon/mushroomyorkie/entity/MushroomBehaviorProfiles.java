package dev.alicon.mushroomyorkie.entity;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import net.fabricmc.fabric.api.event.player.PlayerBlockBreakEvents;
import net.fabricmc.fabric.api.event.player.UseBlockCallback;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;

/** Central behavior-profile switchboard for Mushroom's survival and creative moods. */
public final class MushroomBehaviorProfiles {
	private static final int CRITICAL_NEED_THRESHOLD = 95;
	private static final Map<UUID, CreativeBuildActivity> BUILDERS = new HashMap<>();
	private static boolean registered;

	private MushroomBehaviorProfiles() {
	}

	/** Registers player activity hooks used to select creative builder focus. */
	public static void register() {
		if (registered) {
			return;
		}
		registered = true;
		UseBlockCallback.EVENT.register((player, level, hand, hitResult) -> {
			if (player.getItemInHand(hand).getItem() instanceof BlockItem) {
				recordBuildAction(player, level);
			}
			return InteractionResult.PASS;
		});
		PlayerBlockBreakEvents.AFTER.register((level, player, pos, state, blockEntity) -> recordBuildAction(player, level));
	}

	static boolean keepsCreativeBuilderFocus(MushroomYorkieEntity yorkie, ServerLevel level) {
		return activeProfile(yorkie, level) == Profile.CREATIVE && isBuildingFocused(yorkie, level);
	}

	static boolean keepsRoutineNeedsQuiet(MushroomYorkieEntity yorkie, ServerLevel level) {
		return keepsCreativeBuilderFocus(yorkie, level)
				&& yorkie.needs.hunger() < CRITICAL_NEED_THRESHOLD
				&& yorkie.needs.potty() < CRITICAL_NEED_THRESHOLD;
	}

	static boolean shouldRestLikeSitting(MushroomYorkieEntity yorkie, ServerLevel level) {
		return keepsCreativeBuilderFocus(yorkie, level);
	}

	static boolean shouldNapDuringCreativeBuild(MushroomYorkieEntity yorkie, ServerLevel level) {
		CreativeBuildActivity activity = activityFor(yorkie, level);
		return activity != null && activity.shouldNap(level.getGameTime());
	}

	static boolean buildActionJustHappened(MushroomYorkieEntity yorkie, ServerLevel level) {
		CreativeBuildActivity activity = activityFor(yorkie, level);
		return activity != null && activity.actionJustHappened(level.getGameTime());
	}

	static boolean shouldStartCreativeCheckIn(MushroomYorkieEntity yorkie, ServerLevel level) {
		CreativeBuildActivity activity = activityFor(yorkie, level);
		return activity != null && activity.shouldStartCheckIn(level.getGameTime(), () -> yorkie.getRandom().nextInt(80));
	}

	static boolean ownerHasDirectAttentionItem(LivingEntity owner) {
		return isDirectAttentionItem(owner.getMainHandItem()) || isDirectAttentionItem(owner.getOffhandItem());
	}

	private static Profile activeProfile(MushroomYorkieEntity yorkie, ServerLevel level) {
		return yorkie.getOwner() instanceof Player owner && owner.isCreative() && owner.level() == level ? Profile.CREATIVE : Profile.SURVIVAL;
	}

	private static boolean isBuildingFocused(MushroomYorkieEntity yorkie, ServerLevel level) {
		if (!(yorkie.getOwner() instanceof Player owner) || ownerHasDirectAttentionItem(owner)) {
			return false;
		}
		CreativeBuildActivity activity = activityFor(owner, level);
		return activity != null && activity.isFocused(level.getGameTime());
	}

	private static CreativeBuildActivity activityFor(MushroomYorkieEntity yorkie, ServerLevel level) {
		if (!(yorkie.getOwner() instanceof Player owner) || ownerHasDirectAttentionItem(owner)) {
			return null;
		}
		return activityFor(owner, level);
	}

	private static CreativeBuildActivity activityFor(Player owner, ServerLevel level) {
		CreativeBuildActivity activity = BUILDERS.get(owner.getUUID());
		if (activity != null && activity.isStale(level.getGameTime())) {
			BUILDERS.remove(owner.getUUID());
			return null;
		}
		return activity;
	}

	private static void recordBuildAction(Player player, Level level) {
		if (!(level instanceof ServerLevel serverLevel) || !player.isCreative()) {
			return;
		}

		long now = serverLevel.getGameTime();
		CreativeBuildActivity activity = BUILDERS.computeIfAbsent(player.getUUID(), ignored -> new CreativeBuildActivity(now));
		activity.record(now);
	}

	private static boolean isDirectAttentionItem(ItemStack stack) {
		return MushroomFoodPolicy.recallsFromPeacefulMob(stack) || MushroomFetchToyPolicy.isFetchToy(stack);
	}

	private enum Profile {
		SURVIVAL,
		CREATIVE
	}
}
