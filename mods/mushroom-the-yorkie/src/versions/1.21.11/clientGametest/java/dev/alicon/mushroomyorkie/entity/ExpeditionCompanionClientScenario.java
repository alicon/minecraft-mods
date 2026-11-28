package dev.alicon.mushroomyorkie.entity;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Objects;
import java.util.UUID;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerContext;
import net.minecraft.core.BlockPos;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.monster.spider.Spider;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.block.Blocks;

final class ExpeditionCompanionClientScenario {
	private ExpeditionCompanionClientScenario() {
	}

	static void run(ClientGameTestContext context, TestServerContext server, UUID ownerId, Path status) throws IOException {
		var fixture = server.computeOnServer(minecraft -> {
			var level = minecraft.overworld();
			var owner = Objects.requireNonNull(minecraft.getPlayerList().getPlayer(ownerId));
			BlockPos origin = owner.blockPosition().above(5);
			for (BlockPos pos : BlockPos.betweenClosed(origin.offset(-4, -1, -4), origin.offset(4, -1, 4))) {
				level.setBlockAndUpdate(pos, Blocks.COBBLESTONE.defaultBlockState());
			}
			for (BlockPos pos : BlockPos.betweenClosed(origin.offset(-4, 0, -4), origin.offset(4, 2, 4))) {
				level.setBlockAndUpdate(pos, Blocks.AIR.defaultBlockState());
			}
			owner.teleportTo(origin.getX() + 0.5, origin.getY(), origin.getZ() + 0.5);
			owner.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.STONE_SWORD));
			var dog = Objects.requireNonNull(ModEntities.MUSHROOM_YORKIE.create(level, EntitySpawnReason.TRIGGERED));
			dog.claimFor(owner);
			dog.setPos(origin.getX() + 2.05, origin.getY(), origin.getZ() - 0.65);
			dog.setNoAi(true);
			dog.setHealth(7);
			level.addFreshEntity(dog);
			var spider = Objects.requireNonNull(EntityType.SPIDER.create(level, EntitySpawnReason.TRIGGERED));
			spider.setPos(origin.getX() + 2.7, origin.getY(), origin.getZ() + 0.4);
			spider.setHealth(4);
			// Hold the replay pose so the attack path is isolated from the bridge's owner-defense reflex.
			spider.setNoAi(true);
			level.addFreshEntity(spider);
			return new Fixture(origin, dog, spider);
		});
		context.waitFor(client -> client.player.blockPosition().equals(fixture.origin())
				&& client.player.getMainHandItem().is(Items.STONE_SWORD)
				&& client.level.getEntity(fixture.dog().getId()) instanceof MushroomYorkieEntity
				&& client.level.getEntity(fixture.spider().getId()) instanceof Spider);
		BlockPos errand = fixture.origin().west(3);
		Files.writeString(status.resolveSibling("defense-fixture"),
				"%s\n%d %d %d\n".formatted(fixture.dog().getUUID(), errand.getX(), errand.getY(), errand.getZ()));
		Files.writeString(status, "ready");
		for (int tick = 0; tick < 400; tick += 2) {
			String result = Files.readString(status);
			if ("finished".equals(result)) {
				server.runOnServer(minecraft -> {
					var owner = minecraft.getPlayerList().getPlayer(ownerId);
					if (fixture.spider().isAlive() || fixture.spider().getKillCredit() != owner
							|| !fixture.dog().isAlive() || fixture.dog().getHealth() < 7
							|| !owner.blockPosition().equals(fixture.origin())) {
						throw new AssertionError("Expected the owner to protect the original dog without leaving for the errand");
					}
				});
				context.takeScreenshot("expedition-survival-companion-defense");
				System.out.printf("Expedition companion defense passed: dog=%s spider=%s%n",
						fixture.dog().getUUID(), fixture.spider().getUUID());
				return;
			}
			if ("failed".equals(result)) break;
			context.waitTicks(2);
		}
		context.takeScreenshot("expedition-survival-companion-defense-failure");
		throw new AssertionError("The companion defense controller did not finish");
	}

	private record Fixture(BlockPos origin, MushroomYorkieEntity dog, Spider spider) {
	}
}
