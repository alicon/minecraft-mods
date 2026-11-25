package dev.alicon.narwhaltogether;

import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;

/** Client-to-server request for teleporting to the next available player. */
public record TeleportToNextPlayerPayload() implements CustomPacketPayload {
	/** Stateless singleton payload instance. */
	public static final TeleportToNextPlayerPayload INSTANCE = new TeleportToNextPlayerPayload();
	/** Packet type identifier used by Fabric networking. */
	public static final Type<TeleportToNextPlayerPayload> TYPE =
			new Type<>(NarwhalTogether.id("teleport_to_next_player"));
	/** Codec for the stateless teleport request payload. */
	public static final StreamCodec<RegistryFriendlyByteBuf, TeleportToNextPlayerPayload> CODEC =
			StreamCodec.unit(INSTANCE);

	@Override
	public Type<? extends CustomPacketPayload> type() {
		return TYPE;
	}
}
