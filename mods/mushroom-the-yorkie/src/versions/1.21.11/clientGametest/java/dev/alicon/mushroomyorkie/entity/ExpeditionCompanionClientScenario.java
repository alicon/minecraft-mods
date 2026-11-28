package dev.alicon.mushroomyorkie.entity;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerContext;
import net.fabricmc.fabric.api.entity.event.v1.ServerLivingEntityEvents;
import net.minecraft.core.BlockPos;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.monster.Creeper;
import net.minecraft.world.entity.monster.Monster;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.DoublePlantBlock;
import net.minecraft.world.level.block.state.properties.DoubleBlockHalf;

final class ExpeditionCompanionClientScenario {
	private ExpeditionCompanionClientScenario() {
	}

	static void run(ClientGameTestContext context, TestServerContext server, UUID ownerId, Path status) throws IOException {
		boolean cover = "1".equals(System.getenv("MUSHROOM_EXPEDITION_DEFENSE_COVER"));
		boolean creeperApproach = "1".equals(System.getenv("MUSHROOM_EXPEDITION_DEFENSE_CREEPER"));
		boolean distant = "1".equals(System.getenv("MUSHROOM_EXPEDITION_DEFENSE_DISTANT"));
		boolean blockedStrike = "1".equals(System.getenv("MUSHROOM_EXPEDITION_DEFENSE_BLOCKER"));
		if ((cover ? 1 : 0) + (creeperApproach ? 1 : 0) + (distant ? 1 : 0) + (blockedStrike ? 1 : 0) > 1) {
			throw new IllegalArgumentException("Choose one companion defense fixture");
		}
		if (blockedStrike) {
			Files.writeString(status, "defense-config");
			for (int attempt = 0; !"defense-configured".equals(Files.readString(status)); attempt++) {
				if (attempt >= 100 || "failed".equals(Files.readString(status))) {
					throw new AssertionError("The controller did not stop automatic combat before the defense fixture");
				}
				context.waitTicks(2);
			}
		}
		var fixture = server.computeOnServer(minecraft -> {
			var level = minecraft.overworld();
			var owner = Objects.requireNonNull(minecraft.getPlayerList().getPlayer(ownerId));
			BlockPos origin = owner.blockPosition().above(5);
			int west = creeperApproach ? -9 : -4;
			int east = distant ? 17 : creeperApproach ? 13 : 9;
			for (BlockPos pos : BlockPos.betweenClosed(origin.offset(west, -1, -4), origin.offset(east, -1, 4))) {
				level.setBlockAndUpdate(pos, Blocks.COBBLESTONE.defaultBlockState());
			}
			for (BlockPos pos : BlockPos.betweenClosed(origin.offset(west, 0, -4), origin.offset(east, 2, 4))) {
				level.setBlockAndUpdate(pos, Blocks.AIR.defaultBlockState());
			}
			BlockPos vegetation = cover ? origin.east(2) : null;
			if (vegetation != null) {
				level.setBlockAndUpdate(vegetation.below(), Blocks.GRASS_BLOCK.defaultBlockState());
				level.setBlockAndUpdate(vegetation, Blocks.TALL_GRASS.defaultBlockState());
				level.setBlockAndUpdate(vegetation.above(), Blocks.TALL_GRASS.defaultBlockState()
						.setValue(DoublePlantBlock.HALF, DoubleBlockHalf.UPPER));
			}
			owner.teleportTo(origin.getX() + 0.5, origin.getY(), origin.getZ() + 0.5);
			owner.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.STONE_SWORD));
			var dog = Objects.requireNonNull(ModEntities.MUSHROOM_YORKIE.create(level, EntitySpawnReason.TRIGGERED));
			dog.claimFor(owner);
			double dogX = distant ? 12.5 : creeperApproach ? 10.5 : cover ? 3.1 : blockedStrike ? 4.6 : 5.6;
			dog.setPos(origin.getX() + dogX, origin.getY(), origin.getZ() - 0.65);
			dog.setNoAi(true);
			dog.setHealth(creeperApproach ? 4 : 7);
			level.addFreshEntity(dog);
			if (distant || blockedStrike) level.setDayTime(14_000);
			Monster attacker = Objects.requireNonNull((distant ? EntityType.ZOMBIE : blockedStrike ? EntityType.SKELETON : EntityType.SPIDER)
					.create(level, EntitySpawnReason.TRIGGERED));
			double attackerX = distant ? 14.5 : creeperApproach ? 11.2 : cover || blockedStrike ? 3.2 : 6.2;
			attacker.setPos(origin.getX() + attackerX, origin.getY(), origin.getZ() + 0.4);
			attacker.setHealth(4);
			// Hold the replay pose so the attack path is isolated from the bridge's owner-defense reflex.
			attacker.setNoAi(true);
			level.addFreshEntity(attacker);
			Creeper creeper = null;
			if (creeperApproach) {
				creeper = Objects.requireNonNull(EntityType.CREEPER.create(level, EntitySpawnReason.TRIGGERED));
				creeper.setPos(origin.getX() + 4.9, origin.getY(), origin.getZ() + 0.5);
				creeper.setNoAi(true);
				level.addFreshEntity(creeper);
			}
			Monster blocker = null;
			if (blockedStrike) {
				blocker = Objects.requireNonNull(EntityType.SKELETON.create(level, EntitySpawnReason.TRIGGERED));
				blocker.setPos(origin.getX() + 1.8, origin.getY(), origin.getZ() + 0.45);
				blocker.setHealth(4);
				blocker.setNoAi(true);
				level.addFreshEntity(blocker);
			}
			return new Fixture(origin, dog, attacker, vegetation, creeper, blocker);
		});
		var crossedStrikeFirst = new AtomicBoolean();
		if (blockedStrike) {
			ServerLivingEntityEvents.AFTER_DEATH.register((entity, damage) -> {
				if (entity == fixture.blocker()) crossedStrikeFirst.set(fixture.attacker().isAlive());
			});
		}
		context.waitFor(client -> client.player.blockPosition().equals(fixture.origin())
				&& client.player.getMainHandItem().is(Items.STONE_SWORD)
				&& client.level.getEntity(fixture.dog().getId()) instanceof MushroomYorkieEntity
				&& client.level.getEntity(fixture.attacker().getId()) instanceof Monster
				&& (fixture.creeper() == null || client.level.getEntity(fixture.creeper().getId()) instanceof Creeper)
				&& (fixture.blocker() == null || client.level.getEntity(fixture.blocker().getId()) instanceof Monster));
		BlockPos errand = creeperApproach ? fixture.origin().east(3) : fixture.origin().west(3);
		String scenarioDetails = creeperApproach ? fixture.origin().west(2).getX() + "\n"
				: blockedStrike ? "%s %s\n".formatted(fixture.attacker().getUUID(), fixture.blocker().getUUID()) : "";
		Files.writeString(status.resolveSibling("defense-fixture"),
				"%s\n%d %d %d\n".formatted(fixture.dog().getUUID(), errand.getX(), errand.getY(), errand.getZ())
						+ scenarioDetails);
		Files.writeString(status, "ready");
		for (int tick = 0; tick < 400; tick += 2) {
			String result = Files.readString(status);
			if ("finished".equals(result)) {
				server.runOnServer(minecraft -> {
					var owner = minecraft.getPlayerList().getPlayer(ownerId);
					if (creeperApproach) {
						if (owner.blockPosition().getX() > fixture.origin().west(2).getX() || owner.getHealth() < 20
								|| !fixture.dog().isAlive() || !fixture.dog().isOwnedBy(owner) || fixture.dog().getHealth() != 4
								|| fixture.creeper().getHealth() != 20 || fixture.attacker().getHealth() != 4) {
							throw new AssertionError("Expected a dry retreat from the creeper before attempting melee near Mushroom");
						}
						return;
					}
					boolean approachSucceeded = blockedStrike
							? crossedStrikeFirst.get() && !fixture.blocker().isAlive() && fixture.blocker().getKillCredit() == owner
							: fixture.vegetation() == null
							? owner.blockPosition().getX() > fixture.origin().getX()
							: minecraft.overworld().isEmptyBlock(fixture.vegetation());
					if (fixture.attacker().isAlive() || fixture.attacker().getKillCredit() != owner
							|| !fixture.dog().isAlive() || !fixture.dog().isOwnedBy(owner) || fixture.dog().getHealth() != 7
							|| !approachSucceeded) {
						throw new AssertionError("Expected the owner to reach the attacker and protect the original dog");
					}
				});
				context.takeScreenshot(creeperApproach ? "expedition-survival-creeper-defense" : "expedition-survival-companion-defense");
				if (creeperApproach) {
					System.out.printf("Expedition native creeper retreat passed: dog=%s creeper=%s owner=%s%n",
							fixture.dog().getUUID(), fixture.creeper().getUUID(), ownerId);
					return;
				}
				System.out.printf("Expedition companion defense passed: dog=%s attacker=%s cover=%s distant=%s blocker=%s%n",
						fixture.dog().getUUID(), fixture.attacker().getUUID(), cover, distant, blockedStrike);
				return;
			}
			if ("failed".equals(result)) break;
			context.waitTicks(2);
		}
		context.takeScreenshot("expedition-survival-companion-defense-failure");
		throw new AssertionError("The companion defense controller did not finish");
	}

	private record Fixture(BlockPos origin, MushroomYorkieEntity dog, Monster attacker, BlockPos vegetation, Creeper creeper, Monster blocker) {
	}
}
