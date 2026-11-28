package dev.alicon.mushroomyorkie.entity;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Objects;
import java.util.UUID;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerContext;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.tags.StructureTags;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.EndPortalFrameBlock;
import net.minecraft.world.level.gamerules.GameRules;
import net.minecraft.world.level.levelgen.structure.BoundingBox;
import net.minecraft.world.level.levelgen.structure.pieces.StructurePieceType;
import net.minecraft.world.level.levelgen.structure.structures.StrongholdStructure;
import net.minecraft.world.phys.Vec3;

final class ExpeditionEndEntryClientScenario {
	private ExpeditionEndEntryClientScenario() {
	}

	static void run(ClientGameTestContext context, TestServerContext server, UUID ownerId, Path status, boolean generated) throws IOException {
		var fixture = server.computeOnServer(minecraft -> {
			var owner = Objects.requireNonNull(minecraft.getPlayerList().getPlayer(ownerId));
			var level = minecraft.overworld();
			if (generated) return prepareGeneratedStronghold(level, owner);
			var center = owner.blockPosition().above(6);
			var landing = center.south(3);
			for (BlockPos pos : BlockPos.betweenClosed(center.offset(-6, -2, -6), center.offset(6, -1, 6))) {
				level.setBlockAndUpdate(pos, Blocks.STONE_BRICKS.defaultBlockState());
			}
			for (BlockPos pos : BlockPos.betweenClosed(center.offset(-6, 0, -6), center.offset(6, 3, 6))) {
				level.setBlockAndUpdate(pos, Blocks.AIR.defaultBlockState());
			}
			for (BlockPos pos : BlockPos.betweenClosed(center.offset(-1, -1, -1), center.offset(1, -1, 1))) {
				level.setBlockAndUpdate(pos, Blocks.LAVA.defaultBlockState());
			}
			for (Direction side : Direction.Plane.HORIZONTAL) {
				for (int offset = -1; offset <= 1; offset++) {
					var pos = center.relative(side, 2).relative(side.getClockWise(), offset);
					boolean missing = offset == 0 && (side == Direction.SOUTH || side == Direction.EAST);
					level.setBlockAndUpdate(pos, Blocks.END_PORTAL_FRAME.defaultBlockState()
							.setValue(EndPortalFrameBlock.FACING, side.getOpposite())
							.setValue(EndPortalFrameBlock.HAS_EYE, !missing));
				}
			}
			owner.teleportTo(landing.getX() + 0.5, landing.getY(), landing.getZ() + 0.5);
			owner.getInventory().add(new ItemStack(Items.BLAZE_ROD));
			owner.getInventory().add(new ItemStack(Items.ENDER_PEARL, 2));
			var dog = Objects.requireNonNull(ModEntities.MUSHROOM_YORKIE.create(level, EntitySpawnReason.TRIGGERED));
			dog.claimFor(owner);
			dog.setPos(landing.getX() + 1.5, landing.getY(), landing.getZ() + 0.7);
			level.addFreshEntity(dog);
			return new Fixture(landing, center, dog.getUUID(), dog.getId());
		});
		context.waitFor(client -> client.player.blockPosition().equals(fixture.landing())
				&& client.player.getInventory().contains(stack -> stack.is(generated ? Items.ENDER_EYE : Items.ENDER_PEARL))
				&& client.level.getEntity(fixture.runtimeId()) instanceof MushroomYorkieEntity);
		Files.writeString(status.resolveSibling("end-companion"), fixture.dogId().toString());
		Files.writeString(status, "ready");
		for (int tick = 0; tick < (generated ? 8_000 : 1_800); tick += 5) {
			String result = Files.readString(status);
			if ("finished".equals(result)) {
				server.runOnServer(minecraft -> {
					var owner = minecraft.getPlayerList().getPlayer(ownerId);
					if (!owner.isAlive() || !owner.level().dimension().equals(Level.END)
							|| !(owner.level().getEntity(fixture.dogId()) instanceof MushroomYorkieEntity dog)
							|| !dog.isAlive() || !dog.belongsTo(owner) || dog.isOrderedToSit()
							|| !minecraft.overworld().getBlockState(fixture.center()).is(Blocks.END_PORTAL)
							|| (generated ? owner.getInventory().countItem(Items.ENDER_EYE) >= 12
									: owner.getInventory().contains(stack -> stack.is(Items.ENDER_EYE) || stack.is(Items.ENDER_PEARL)
											|| stack.is(Items.BLAZE_POWDER) || stack.is(Items.BLAZE_ROD)))) {
						throw new AssertionError("Expected a completed vanilla portal and the same living dog in the End");
					}
				});
				context.takeScreenshot(generated ? "expedition-survival-generated-end-entry" : "expedition-survival-end-entry");
				System.out.printf("Expedition native %sEnd entry passed: dog=%s owner=%s%n", generated ? "generated " : "", fixture.dogId(), ownerId);
				return;
			}
			if ("failed".equals(result)) break;
			context.waitTicks(5);
		}
		throw new AssertionError("The controller did not complete and cross the native End portal");
	}

	private static Fixture prepareGeneratedStronghold(ServerLevel level, ServerPlayer owner) {
		level.getGameRules().set(GameRules.SPAWN_MOBS, false, level.getServer());
		level.getGameRules().set(GameRules.SPAWNER_BLOCKS_WORK, false, level.getServer());
		var locate = Objects.requireNonNull(level.findNearestMapStructure(StructureTags.EYE_OF_ENDER_LOCATED,
				owner.blockPosition(), 100, false));
		var chunk = new ChunkPos(locate);
		level.getChunk(chunk.x, chunk.z);
		var structure = level.structureManager().startsForStructure(chunk, candidate -> candidate instanceof StrongholdStructure)
				.stream().findFirst().orElseThrow();
		var portalRoom = structure.getPieces().stream().filter(piece -> piece.getType() == StructurePieceType.STRONGHOLD_PORTAL_ROOM)
				.findFirst().orElseThrow().getBoundingBox();
		var center = portalCenter(level, portalRoom);
		var landing = structure.getPieces().stream()
				.filter(piece -> piece.getType() == StructurePieceType.STRONGHOLD_STRAIGHT
						|| piece.getType() == StructurePieceType.STRONGHOLD_CHEST_CORRIDOR
						|| piece.getType() == StructurePieceType.STRONGHOLD_FIVE_CROSSING)
				.map(piece -> dryLanding(level, piece.getBoundingBox())).filter(Objects::nonNull)
				.filter(pos -> Math.abs(pos.getY() - center.getY()) <= 6
						&& pos.distSqr(center) >= 16 * 16 && pos.distSqr(center) <= 38 * 38)
				.min(java.util.Comparator.comparingDouble(center::distSqr))
				.orElseThrow(() -> new AssertionError("No dry generated corridor approach to the portal room"));

		var playerPosition = Vec3.atBottomCenterOf(landing);
		owner.teleportTo(playerPosition.x, playerPosition.y, playerPosition.z);
		owner.getInventory().add(new ItemStack(Items.ENDER_EYE, 12));
		owner.getInventory().add(new ItemStack(Items.IRON_PICKAXE));
		owner.getInventory().add(new ItemStack(Items.IRON_SWORD));
		owner.getInventory().add(new ItemStack(Items.COOKED_MUTTON, 8));
		var dog = Objects.requireNonNull(ModEntities.MUSHROOM_YORKIE.create(level, EntitySpawnReason.TRIGGERED));
		dog.claimFor(owner);
		dog.setPos(playerPosition);
		level.addFreshEntity(dog);
		System.out.printf("Expedition generated stronghold fixture: start=%s portal=%s distance=%.1f%n",
				landing, center, Math.sqrt(landing.distSqr(center)));
		return new Fixture(landing, center, dog.getUUID(), dog.getId());
	}

	private static BlockPos dryLanding(ServerLevel level, BoundingBox room) {
		for (BlockPos tile : BlockPos.betweenClosed(new BlockPos(room.minX() + 1, room.minY() + 1, room.minZ() + 1),
				new BlockPos(room.maxX() - 1, room.maxY() - 2, room.maxZ() - 1))) {
			if (level.isEmptyBlock(tile) && level.isEmptyBlock(tile.above())
					&& level.getBlockState(tile.below()).isFaceSturdy(level, tile.below(), Direction.UP)) return tile.immutable();
		}
		return null;
	}

	private static BlockPos portalCenter(ServerLevel level, BoundingBox room) {
		for (BlockPos tile : BlockPos.betweenClosed(new BlockPos(room.minX() + 2, room.minY(), room.minZ() + 2),
				new BlockPos(room.maxX() - 2, room.maxY(), room.maxZ() - 2))) {
			boolean ring = true;
			for (Direction side : Direction.Plane.HORIZONTAL) {
				for (int offset = -1; offset <= 1; offset++) {
					ring &= level.getBlockState(tile.relative(side, 2).relative(side.getClockWise(), offset)).is(Blocks.END_PORTAL_FRAME);
				}
			}
			if (ring) return tile.immutable();
		}
		throw new AssertionError("No vanilla End portal frames in the generated portal room");
	}

	private record Fixture(BlockPos landing, BlockPos center, UUID dogId, int runtimeId) {
	}
}
