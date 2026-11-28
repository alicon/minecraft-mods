package dev.alicon.mushroomyorkie.entity;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Objects;
import java.util.UUID;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerContext;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.stats.Stats;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.gamerules.GameRules;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

final class ExpeditionPearlClientScenario {
	private ExpeditionPearlClientScenario() {
	}

	static void run(ClientGameTestContext context, TestServerContext server, UUID ownerId, Path status) throws IOException {
		var fixture = server.computeOnServer(minecraft -> {
			var level = minecraft.overworld();
			var owner = Objects.requireNonNull(minecraft.getPlayerList().getPlayer(ownerId));
			var origin = owner.blockPosition().immutable();
			fill(level, origin.offset(-6, -1, -8), origin.offset(21, -1, 8), false);
			fill(level, origin.offset(-6, 0, -8), origin.offset(21, 4, 8), true);
			fill(level, origin.offset(-2, 2, -2), origin.offset(2, 2, 2), false);
			fill(level, origin.offset(-1, 0, -1), origin.offset(-1, 1, 1), false);
			fill(level, origin.offset(0, 0, -1), origin.offset(1, 1, -1), false);
			fill(level, origin.offset(6, 2, -2), origin.offset(10, 2, 2), false);
			// Dusk lets the encounter use the stay and recall commands before the dog goes to sleep.
			level.setDayTime(12_750);
			level.getGameRules().set(GameRules.ADVANCE_TIME, false, minecraft);
			level.getGameRules().set(GameRules.SPAWN_MOBS, false, minecraft);
			var start = Vec3.atBottomCenterOf(origin);
			owner.teleportTo(start.x, start.y, start.z);
			owner.getInventory().add(new ItemStack(Items.IRON_SWORD));
			owner.getInventory().add(new ItemStack(Items.BLAZE_POWDER));
			var dog = Objects.requireNonNull(ModEntities.MUSHROOM_YORKIE.create(level, EntitySpawnReason.TRIGGERED));
			dog.claimFor(owner);
			dog.setPos(Vec3.atBottomCenterOf(origin.south()));
			level.addFreshEntity(dog);
			spawnEnderman(level, origin);
			return new Fixture(origin, dog.getUUID(), dog.getId(), dog.getHealth());
		});
		context.waitFor(client -> client.player.blockPosition().equals(fixture.origin())
				&& client.player.getInventory().contains(stack -> stack.is(Items.IRON_SWORD))
				&& client.level.getEntity(fixture.runtimeId()) instanceof MushroomYorkieEntity);
		Files.writeString(status.resolveSibling("pearl-companion"), fixture.dog().toString());
		Files.writeString(status, "ready");
		int spawned = 1;
		boolean sawStay = false;
		for (int tick = 0; tick < 4_400; tick += 10) {
			String result = Files.readString(status);
			if ("failed".equals(result)) break;
			var observed = server.computeOnServer(minecraft -> {
				var level = minecraft.overworld();
				var owner = minecraft.getPlayerList().getPlayer(ownerId);
				if (!owner.isAlive() || owner.level() != level
						|| !(level.getEntity(fixture.dog()) instanceof MushroomYorkieEntity dog)
						|| !dog.isAlive() || !dog.isOwnedBy(owner) || dog.getHealth() != fixture.health()) {
					throw new AssertionError("The pearl hunt must keep the original companion and owner safe");
				}
				if (dog.isOrderedToSit() && !dog.blockPosition().closerThan(fixture.origin(), 4)) {
					throw new AssertionError("Mushroom stayed outside the covered camp");
				}
				var arena = new AABB(fixture.origin().offset(-6, -2, -8).getCenter(), fixture.origin().offset(21, 4, 8).getCenter());
				boolean pearlOnGround = !level.getEntitiesOfClass(ItemEntity.class, arena.inflate(1),
						item -> item.isAlive() && item.getItem().is(Items.ENDER_PEARL)).isEmpty();
				return new Observation(owner.getStats().getValue(Stats.ENTITY_KILLED.get(EntityType.ENDERMAN)),
						owner.getStats().getValue(Stats.ITEM_CRAFTED.get(Items.ENDER_EYE)),
						owner.getInventory().countItem(Items.ENDER_EYE), owner.getInventory().countItem(Items.ENDER_PEARL),
						pearlOnGround, dog.isOrderedToSit(), dog.distanceTo(owner));
			});
			sawStay |= observed.sitting();
			if ("finished".equals(result)) {
				if (!sawStay || observed.sitting() || observed.distance() > 4 || observed.kills() < 1
						|| observed.crafted() != 1 || observed.eyes() != 1) {
					throw new AssertionError("Expected an earned pearl crafted into an Eye and the original Mushroom recalled: sawStay="
							+ sawStay + ", " + observed);
				}
				System.out.printf("Expedition native pearl and Eye passed: dog=%s endermanKills=%d eyes=%d%n",
						fixture.dog(), observed.kills(), observed.eyes());
				context.takeScreenshot("expedition-survival-ender-supplies");
				return;
			}
			if (observed.kills() == spawned && observed.pearls() == 0 && !observed.pearlOnGround()
					&& observed.eyes() == 0 && spawned < 6) {
				server.runOnServer(minecraft -> spawnEnderman(minecraft.overworld(), fixture.origin()));
				spawned++;
			}
			context.waitTicks(10);
		}
		throw new AssertionError("The controller did not earn a native Ender pearl and craft an Eye");
	}

	private static void fill(ServerLevel level, BlockPos from, BlockPos to, boolean clear) {
		var state = (clear ? Blocks.AIR : Blocks.COBBLESTONE).defaultBlockState();
		for (BlockPos pos : BlockPos.betweenClosed(from, to)) level.setBlockAndUpdate(pos, state);
	}

	private static void spawnEnderman(ServerLevel level, BlockPos origin) {
		var enderman = Objects.requireNonNull(EntityType.ENDERMAN.create(level, EntitySpawnReason.TRIGGERED));
		enderman.setPos(Vec3.atBottomCenterOf(origin.east(13)));
		enderman.setPersistenceRequired();
		level.addFreshEntity(enderman);
	}

	private record Fixture(BlockPos origin, UUID dog, int runtimeId, float health) {
	}

	private record Observation(int kills, int crafted, int eyes, int pearls, boolean pearlOnGround, boolean sitting, float distance) {
	}
}
