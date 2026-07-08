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
	private static final int BUILD_WINDOW_TICKS = 20 * 10;
	private static final int BUILD_ACTIONS_TO_FOCUS = 3;
	private static final int BUILD_FOCUS_TICKS = 20 * 90;
	private static final int NAP_AFTER_QUIET_TICKS = 20 * 35;
	private static final int CHECK_IN_AFTER_QUIET_TICKS = 20 * 9;
	private static final int CHECK_IN_COOLDOWN_TICKS = 20 * 240;
	private static final int CRITICAL_NEED_THRESHOLD = 95;
	private static final Map<UUID, BuildActivity> BUILDERS = new HashMap<>();
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
		BuildActivity activity = activityFor(yorkie, level);
		return activity != null && level.getGameTime() - activity.lastBuildAction >= NAP_AFTER_QUIET_TICKS;
	}

	static boolean buildActionJustHappened(MushroomYorkieEntity yorkie, ServerLevel level) {
		BuildActivity activity = activityFor(yorkie, level);
		return activity != null && level.getGameTime() - activity.lastBuildAction <= 20;
	}

	static boolean shouldStartCreativeCheckIn(MushroomYorkieEntity yorkie, ServerLevel level) {
		BuildActivity activity = activityFor(yorkie, level);
		if (activity == null || level.getGameTime() - activity.lastBuildAction < CHECK_IN_AFTER_QUIET_TICKS) {
			return false;
		}
		if (level.getGameTime() < activity.nextCheckInGameTime || yorkie.getRandom().nextInt(80) != 0) {
			return false;
		}

		activity.nextCheckInGameTime = level.getGameTime() + CHECK_IN_COOLDOWN_TICKS;
		return true;
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
		BuildActivity activity = activityFor(owner, level);
		return activity != null && level.getGameTime() < activity.focusUntilGameTime;
	}

	private static BuildActivity activityFor(MushroomYorkieEntity yorkie, ServerLevel level) {
		if (!(yorkie.getOwner() instanceof Player owner) || ownerHasDirectAttentionItem(owner)) {
			return null;
		}
		return activityFor(owner, level);
	}

	private static BuildActivity activityFor(Player owner, ServerLevel level) {
		BuildActivity activity = BUILDERS.get(owner.getUUID());
		if (activity != null && level.getGameTime() - activity.lastBuildAction > BUILD_FOCUS_TICKS * 2L) {
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
		BuildActivity activity = BUILDERS.computeIfAbsent(player.getUUID(), ignored -> new BuildActivity(now));
		activity.record(now);
	}

	private static boolean isDirectAttentionItem(ItemStack stack) {
		return MushroomFoodPolicy.recallsFromPeacefulMob(stack) || MushroomFetchToyPolicy.isFetchToy(stack);
	}

	private enum Profile {
		SURVIVAL,
		CREATIVE
	}

	private static final class BuildActivity {
		private long windowStartGameTime;
		private int buildActionsInWindow;
		private long lastBuildAction;
		private long focusUntilGameTime;
		private long nextCheckInGameTime;

		private BuildActivity(long now) {
			this.windowStartGameTime = now;
			this.lastBuildAction = now;
		}

		private void record(long now) {
			if (now - this.windowStartGameTime > BUILD_WINDOW_TICKS) {
				this.windowStartGameTime = now;
				this.buildActionsInWindow = 0;
			}
			this.buildActionsInWindow++;
			this.lastBuildAction = now;
			if (this.buildActionsInWindow >= BUILD_ACTIONS_TO_FOCUS || now < this.focusUntilGameTime) {
				this.focusUntilGameTime = now + BUILD_FOCUS_TICKS;
			}
		}
	}
}
