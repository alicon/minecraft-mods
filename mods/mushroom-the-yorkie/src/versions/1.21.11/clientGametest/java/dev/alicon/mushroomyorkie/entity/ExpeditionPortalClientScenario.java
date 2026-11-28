package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.item.ModItems;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerContext;
import net.fabricmc.fabric.api.entity.event.v1.ServerLivingEntityEvents;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.stats.Stats;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.NetherPortalBlock;
import net.minecraft.world.level.block.entity.ChestBlockEntity;
import net.minecraft.world.phys.AABB;

final class ExpeditionPortalClientScenario {
	private static final int DISTANT_FORTRESS_OFFSET = 40;

	private ExpeditionPortalClientScenario() {
	}

	static void run(ClientGameTestContext context, TestServerContext server, UUID ownerId, Path status, boolean blazeHunt,
			boolean distantFortress) throws IOException {
		int fortressOffset = distantFortress ? DISTANT_FORTRESS_OFFSET : 0;
		var fixture = server.computeOnServer(minecraft -> {
			var owner = Objects.requireNonNull(minecraft.getPlayerList().getPlayer(ownerId));
			var home = minecraft.overworld();
			var nether = Objects.requireNonNull(minecraft.getLevel(Level.NETHER));
			var origin = owner.blockPosition().above(6);
			var destination = new BlockPos(Math.floorDiv(origin.getX(), 8), origin.getY(), Math.floorDiv(origin.getZ(), 8));
			preparePortal(home, origin, false);
			preparePortal(nether, destination, true);
			UUID neutralPiglin = null;
			owner.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.IRON_INGOT));
			if (blazeHunt) {
				if (distantFortress) {
					prepareFortressAccess(nether, destination);
					var piglin = Objects.requireNonNull(EntityType.ZOMBIFIED_PIGLIN.create(nether, EntitySpawnReason.TRIGGERED));
					var neutralPosition = destination.east(2).south(9);
					piglin.setPos(neutralPosition.getX() + 0.5, neutralPosition.getY(), neutralPosition.getZ() + 0.5);
					piglin.setNoAi(true);
					nether.addFreshEntity(piglin);
					neutralPiglin = piglin.getUUID();
				}
				prepareFortressRoom(nether, destination.south(fortressOffset));
				owner.getInventory().add(new ItemStack(Items.IRON_SWORD));
				owner.getInventory().add(new ItemStack(Items.BOW));
				owner.getInventory().add(new ItemStack(Items.ARROW, 24));
				owner.getInventory().add(new ItemStack(Items.COOKED_BEEF, 8));
				owner.getInventory().add(new ItemStack(ModItems.CAMP_MAT));
				owner.setItemSlot(EquipmentSlot.CHEST, new ItemStack(Items.IRON_CHESTPLATE));
				owner.setItemSlot(EquipmentSlot.LEGS, new ItemStack(Items.IRON_LEGGINGS));
			}
			var landing = origin.south(3);
			var chestPos = landing.east(2);
			home.setBlockAndUpdate(chestPos, Blocks.CHEST.defaultBlockState());
			var chest = (ChestBlockEntity) Objects.requireNonNull(home.getBlockEntity(chestPos));
			chest.setItem(0, new ItemStack(Items.OBSIDIAN));
			chest.setItem(1, new ItemStack(Items.FLINT));
			chest.setItem(2, new ItemStack(Items.COBBLESTONE));
			owner.teleportTo(landing.getX() + 0.5, landing.getY(), landing.getZ() + 0.5);
			var dog = Objects.requireNonNull(ModEntities.MUSHROOM_YORKIE.create(home, EntitySpawnReason.TRIGGERED));
			dog.claimFor(owner);
			dog.setPos(landing.getX() + 1.5, landing.getY(), landing.getZ() + 0.5);
			home.addFreshEntity(dog);
			return new Fixture(origin, landing, chestPos, destination.south(fortressOffset + 13), dog.getUUID(), dog.getId(), neutralPiglin);
		});
		context.waitFor(client -> client.player.blockPosition().equals(fixture.landing())
				&& client.player.getMainHandItem().is(Items.IRON_INGOT)
				&& client.level.getEntity(fixture.runtimeId()) instanceof MushroomYorkieEntity);
		var companionDeath = new AtomicReference<String>();
		ServerLivingEntityEvents.AFTER_DEATH.register((entity, source) -> {
			if (entity.getUUID().equals(fixture.dogId())) {
				companionDeath.set(source.getLocalizedDeathMessage(entity).getString() + " at " + entity.blockPosition());
			}
		});
		Files.writeString(status.resolveSibling("portal-companion"), fixture.dogId().toString());
		Files.writeString(status, "ready");
		boolean togetherInNether = false;
		var blazes = new ArrayList<UUID>();
		for (int tick = 0; tick < (blazeHunt ? 6_000 : 1_600); tick += 5) {
			if (companionDeath.get() != null) {
				throw new AssertionError("The original Nether companion died: " + companionDeath.get());
			}
			String result = Files.readString(status);
			togetherInNether |= server.computeOnServer(minecraft -> {
				var owner = minecraft.getPlayerList().getPlayer(ownerId);
				return owner.level().dimension().equals(Level.NETHER)
						&& validDog(owner, owner.level().getEntity(fixture.dogId()));
			});
			if (blazeHunt && togetherInNether) {
				server.runOnServer(minecraft -> {
					var owner = minecraft.getPlayerList().getPlayer(ownerId);
					var neutralPosition = fixture.blazeRoom().north(DISTANT_FORTRESS_OFFSET + 4).east(2);
					if (fixture.neutralPiglin() != null && owner.level().dimension().equals(Level.NETHER)
							&& owner.blockPosition().closerThan(neutralPosition, 16)) {
						var nether = minecraft.getLevel(Level.NETHER);
						if (!(nether.getEntity(fixture.neutralPiglin()) instanceof LivingEntity piglin)
								|| piglin.getHealth() < piglin.getMaxHealth()) {
							throw new AssertionError("Mushroom or the player attacked the unprovoked zombified piglin");
						}
					}
					if (owner.level().dimension().equals(Level.NETHER)
							&& minecraft.overworld().getEntity(fixture.dogId()) instanceof MushroomYorkieEntity dog
							&& dog.isOrderedToSit()) {
						throw new AssertionError("Mushroom crossed back to the Overworld while seated at " + dog.blockPosition());
					}
				});
				stageBlaze(server, ownerId, fixture, blazes);
			}
			if ("finished".equals(result)) {
				if (!togetherInNether) throw new AssertionError("The original dog never reached the Nether with its owner");
				server.runOnServer(minecraft -> {
					var owner = minecraft.getPlayerList().getPlayer(ownerId);
					var home = minecraft.overworld();
					var chest = (ChestBlockEntity) home.getBlockEntity(fixture.chest());
					if (!owner.level().dimension().equals(Level.OVERWORLD)
							|| !validDog(owner, home.getEntity(fixture.dogId()))
							|| !home.getBlockState(fixture.origin().west().above(2)).is(Blocks.OBSIDIAN)
							|| !home.getBlockState(fixture.origin()).is(Blocks.NETHER_PORTAL)
							|| !owner.getInventory().contains(stack -> stack.is(Items.FLINT_AND_STEEL) && stack.isDamaged())
							|| chest == null || !chest.getItem(0).isEmpty() || !chest.getItem(1).isEmpty()
							|| !chest.getItem(2).is(Items.COBBLESTONE)) {
						throw new AssertionError("Expected the repaired, lit frame and the same living dog and owner back home");
					}
						if (blazeHunt) {
							var dog = (MushroomYorkieEntity) home.getEntity(fixture.dogId());
							if (blazes.isEmpty() || owner.getStats().getValue(Stats.ENTITY_KILLED.get(EntityType.BLAZE)) == 0
							|| owner.getStats().getValue(Stats.ITEM_CRAFTED.get(Items.BLAZE_POWDER)) < 2
							|| owner.getInventory().countItem(Items.BLAZE_POWDER) < 2 || dog.isOrderedToSit()
									|| owner.getStats().getValue(Stats.ITEM_USED.get(Items.BOW)) == 0
								|| dog.expeditionCamp.anchor() == null || !dog.expeditionCamp.anchor().dimension().equals(Level.NETHER)
								|| (distantFortress && dog.expeditionCamp.anchor().pos().getZ() < fixture.blazeRoom().getZ() - 32)) {
							throw new AssertionError("Expected powder crafted from an earned blaze rod and the original dog recalled from his Nether camp");
							}
						System.out.printf("Expedition native Nether supplies passed: dog=%s powder=%d%n",
								fixture.dogId(), owner.getInventory().countItem(Items.BLAZE_POWDER));
						}
				});
				context.takeScreenshot("expedition-survival-nether-return");
				System.out.printf("Expedition Nether round trip passed: dog=%s owner=%s%n", fixture.dogId(), ownerId);
				return;
			}
			if ("failed".equals(result)) break;
			context.waitTicks(5);
		}
		throw new AssertionError("The Nether portal controller did not finish the round trip");
	}

	private static void stageBlaze(TestServerContext server, UUID ownerId, Fixture fixture, List<UUID> blazes) {
		if (blazes.size() >= 6) return;
		var spawned = server.computeOnServer(minecraft -> {
			var owner = minecraft.getPlayerList().getPlayer(ownerId);
			var nether = minecraft.getLevel(Level.NETHER);
			if (owner.level() != nether || owner.getInventory().countItem(Items.BLAZE_ROD) > 0
					|| !(nether.getEntity(fixture.dogId()) instanceof MushroomYorkieEntity dog) || !dog.isOrderedToSit()
					|| (!blazes.isEmpty() && nether.getEntity(blazes.getLast()) != null)) return null;
			var pos = fixture.blazeRoom();
			if (!nether.getEntitiesOfClass(ItemEntity.class, new AABB(pos).inflate(12),
					drop -> drop.getItem().is(Items.BLAZE_ROD)).isEmpty()) return null;
			var blaze = Objects.requireNonNull(EntityType.BLAZE.create(nether, EntitySpawnReason.TRIGGERED));
			blaze.setPos(pos.getX() + 0.5, pos.getY(), pos.getZ() + 0.5);
			nether.addFreshEntity(blaze);
			return blaze.getUUID();
		});
		if (spawned != null) blazes.add(spawned);
	}

	private static void prepareFortressRoom(ServerLevel level, BlockPos opening) {
		for (BlockPos pos : BlockPos.betweenClosed(opening.offset(-4, -1, 5), opening.offset(5, 3, 17))) {
			boolean boundary = pos.getX() == opening.getX() - 4 || pos.getX() == opening.getX() + 5
					|| pos.getY() == opening.getY() - 1 || pos.getY() == opening.getY() + 3
					|| pos.getZ() == opening.getZ() + 17;
			level.setBlockAndUpdate(pos, (boundary ? Blocks.NETHER_BRICKS : Blocks.AIR).defaultBlockState());
		}
	}

	private static void prepareFortressAccess(ServerLevel level, BlockPos opening) {
		for (BlockPos pos : BlockPos.betweenClosed(opening.offset(-4, -1, -5), opening.offset(5, 3, DISTANT_FORTRESS_OFFSET + 4))) {
			int x = pos.getX() - opening.getX();
			int y = pos.getY() - opening.getY();
			int z = pos.getZ() - opening.getZ();
			boolean alcove = x >= -3 && x <= -1 && z >= 21 && z <= 40;
			boolean corridor = x >= 0 && x <= 3 && z > -5;
			if (y == -1 && z >= 6) level.setBlockAndUpdate(pos, Blocks.NETHERRACK.defaultBlockState());
			if (y >= 0 && (z >= 5 || x < -3 || x > 4 || z == -5)) {
				level.setBlockAndUpdate(pos, (corridor && y < 3 || alcove && y < 2
						? Blocks.AIR : Blocks.NETHERRACK).defaultBlockState());
			}
		}
	}

	private static boolean validDog(ServerPlayer owner, Entity animal) {
		return animal instanceof MushroomYorkieEntity dog && dog.isAlive() && dog.belongsTo(owner);
	}

	private static void preparePortal(ServerLevel level, BlockPos opening, boolean lit) {
		for (BlockPos pos : BlockPos.betweenClosed(opening.offset(-3, -1, -5), opening.offset(4, -1, 5))) {
			level.setBlockAndUpdate(pos, Blocks.COBBLESTONE.defaultBlockState());
		}
		for (BlockPos pos : BlockPos.betweenClosed(opening.offset(-3, 0, -5), opening.offset(4, 4, 5))) {
			level.setBlockAndUpdate(pos, Blocks.AIR.defaultBlockState());
		}
		for (int x = -1; x <= 2; x++) {
			for (int y = -1; y <= 3; y++) {
				var pos = opening.offset(x, y, 0);
				if (x < 0 || x > 1 || y < 0 || y > 2) {
					if (lit || x != -1 || y != 2) level.setBlockAndUpdate(pos, Blocks.OBSIDIAN.defaultBlockState());
				}
			}
		}
		if (lit) {
			var portal = Blocks.NETHER_PORTAL.defaultBlockState().setValue(NetherPortalBlock.AXIS, Direction.Axis.X);
			for (BlockPos pos : BlockPos.betweenClosed(opening, opening.offset(1, 2, 0))) {
				level.setBlock(pos, portal, Block.UPDATE_CLIENTS);
			}
		}
	}

	private record Fixture(BlockPos origin, BlockPos landing, BlockPos chest, BlockPos blazeRoom, UUID dogId, int runtimeId, UUID neutralPiglin) {
	}
}
