package dev.alicon.mushroomyorkie.entity;

import com.mojang.authlib.GameProfile;
import io.netty.channel.embedded.EmbeddedChannel;
import java.util.UUID;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.network.Connection;
import net.minecraft.network.protocol.PacketFlow;
import net.minecraft.server.level.ClientInformation;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.network.CommonListenerCookie;
import net.minecraft.world.level.GameType;

/** Vanilla's mock server player hardcodes creative mode, even after setGameMode. */
final class SurvivalGameTestPlayers {
	private SurvivalGameTestPlayers() {
	}

	static ServerPlayer create(GameTestHelper helper) {
		var level = helper.getLevel();
		GameProfile profile = new GameProfile(UUID.randomUUID(), "fetch-survival");
		ServerPlayer player = new ServerPlayer(level.getServer(), level, profile, ClientInformation.createDefault());
		Connection connection = new Connection(PacketFlow.SERVERBOUND);
		new EmbeddedChannel(connection);
		level.getServer().getPlayerList().placeNewPlayer(connection, player, CommonListenerCookie.createInitial(profile, false));
		player.setGameMode(GameType.SURVIVAL);
		player.setInvulnerable(true);
		player.setNoGravity(true);
		helper.assertTrue(!player.isCreative() && !player.isSpectator(), "Survival test player has the wrong mode");
		return player;
	}
}
