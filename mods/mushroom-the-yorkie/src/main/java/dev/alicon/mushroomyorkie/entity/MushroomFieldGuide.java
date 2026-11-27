package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.item.FieldGuidePagesPayload;
import dev.alicon.mushroomyorkie.item.ModItems;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;

/** Gives the adoption guide and routes its air-use and crouch-use to the nearby owned dog. */
public final class MushroomFieldGuide {
	private static final int DOG_RANGE = 16;
	private static final String BOOK = "book.mushroom_yorkie.";

	/** Gifts a replaceable guide after Survival adoption. It drops beside a handler with full inventory. */
	public static void giveOnAdoption(Player player) {
		if (!player.getInventory().contains(new ItemStack(ModItems.FIELD_GUIDE))) {
			player.getInventory().placeItemBackInInventory(new ItemStack(ModItems.FIELD_GUIDE));
			player.displayClientMessage(Component.translatable("message.mushroom_yorkie.training_guide_received"), false);
		}
	}

	/** Handles a regular read or a training cue from the owner's held guide. */
	public static void use(Player player) {
		if (!(player instanceof ServerPlayer owner) || !(owner.level() instanceof ServerLevel level)
				|| owner.isSpectator()) {
			return;
		}
		var dog = level.getEntitiesOfClass(MushroomYorkieEntity.class, owner.getBoundingBox().inflate(DOG_RANGE),
				candidate -> candidate.isAlive() && candidate.isOwnedBy(owner)
						&& candidate.distanceToSqr(owner) <= DOG_RANGE * DOG_RANGE).stream()
				.min(Comparator.comparingDouble(candidate -> candidate.distanceToSqr(owner))).orElse(null);

		if (owner.isShiftKeyDown()) {
			if (dog == null) {
				MushroomCampInteractions.notice(owner, "training_no_dog");
			} else {
				dog.leaveItTraining.cue(level, dog, owner);
			}
		} else if (ServerPlayNetworking.canSend(owner, FieldGuidePagesPayload.TYPE)) {
			ServerPlayNetworking.send(owner, pages(dog));
		}
	}

	static FieldGuidePagesPayload pages(MushroomYorkieEntity dog) {
		var paws = dog == null ? List.<MushroomLeaveItTraining.Paw>of() : dog.leaveItTraining.paws();
		List<Component> pages = new ArrayList<>();
		pages.add(exercise("practice", "\ue010", paws.size()));
		pages.add(exercise("repeat", "\ue011", paws.size()));
		pages.add(exercise("trail", "\ue012", paws.size()));

		var memories = Component.empty()
				.append(Component.translatable(BOOK + "memories.title").withStyle(ChatFormatting.BOLD))
				.append("\n").append(pawRow(paws.size())).append("\n");
		if (dog == null) {
			memories.append(Component.translatable(BOOK + "memories.no_dog"));
		} else if (paws.isEmpty()) {
			memories.append(Component.translatable(BOOK + "memories.empty"));
		}
		for (int i = 0; i < paws.size(); i++) {
			var place = paws.get(i).place();
			memories.append(Component.translatable(BOOK + "memories.place", i + 1,
					FieldGuidePlatform.dimensionName(place), place.pos().toShortString()))
					.append("\n");
		}
		pages.add(memories);
		return new FieldGuidePagesPayload(List.copyOf(pages), paws.size());
	}

	private static Component exercise(String key, String picture, int paws) {
		String lesson = BOOK + key;
		return Component.empty()
				.append(Component.translatable(lesson + ".title").withStyle(ChatFormatting.BOLD))
				.append("\n\n").append(FieldGuidePlatform.picture(picture))
				.append(" ").append(pawRow(paws)).append("\n\n")
				.append(Component.translatable(lesson + ".steps"));
	}

	private static MutableComponent pawRow(int earned) {
		return FieldGuidePlatform.picture("\ue000".repeat(earned) + "\ue001".repeat(MushroomLeaveItTraining.PAWS - earned));
	}
}
