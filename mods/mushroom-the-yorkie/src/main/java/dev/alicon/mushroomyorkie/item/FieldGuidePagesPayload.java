package dev.alicon.mushroomyorkie.item;

import dev.alicon.mushroomyorkie.MushroomTheYorkie;
import java.util.List;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.ComponentSerialization;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;

/** Carries the owner's lesson pages without saving another dog's memories on the physical book. */
public record FieldGuidePagesPayload(List<Component> pages, int openPage) implements CustomPacketPayload {
	/** Server-to-owner book opening packet. */
	public static final Type<FieldGuidePagesPayload> TYPE = new Type<>(MushroomTheYorkie.id("field_guide_pages"));
	/** Bounded codec for the vanilla book page limit. */
	public static final StreamCodec<RegistryFriendlyByteBuf, FieldGuidePagesPayload> CODEC = StreamCodec.composite(
			ComponentSerialization.STREAM_CODEC.apply(ByteBufCodecs.list(100)), FieldGuidePagesPayload::pages,
			ByteBufCodecs.VAR_INT, FieldGuidePagesPayload::openPage, FieldGuidePagesPayload::new
	);

	@Override
	public Type<? extends CustomPacketPayload> type() {
		return TYPE;
	}
}
