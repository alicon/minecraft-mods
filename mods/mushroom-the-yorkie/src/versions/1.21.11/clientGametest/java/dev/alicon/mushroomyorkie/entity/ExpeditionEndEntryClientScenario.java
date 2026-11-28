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
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.EndPortalFrameBlock;

final class ExpeditionEndEntryClientScenario {
	private ExpeditionEndEntryClientScenario() {
	}

	static void run(ClientGameTestContext context, TestServerContext server, UUID ownerId, Path status) throws IOException {
		var fixture = server.computeOnServer(minecraft -> {
			var owner = Objects.requireNonNull(minecraft.getPlayerList().getPlayer(ownerId));
			var level = minecraft.overworld();
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
				&& client.player.getInventory().contains(stack -> stack.is(Items.ENDER_PEARL))
				&& client.level.getEntity(fixture.runtimeId()) instanceof MushroomYorkieEntity);
		Files.writeString(status.resolveSibling("end-companion"), fixture.dogId().toString());
		Files.writeString(status, "ready");
		for (int tick = 0; tick < 1_800; tick += 5) {
			String result = Files.readString(status);
			if ("finished".equals(result)) {
				server.runOnServer(minecraft -> {
					var owner = minecraft.getPlayerList().getPlayer(ownerId);
					if (!owner.isAlive() || !owner.level().dimension().equals(Level.END)
							|| !(owner.level().getEntity(fixture.dogId()) instanceof MushroomYorkieEntity dog)
							|| !dog.isAlive() || !dog.belongsTo(owner) || dog.isOrderedToSit()
							|| !minecraft.overworld().getBlockState(fixture.center()).is(Blocks.END_PORTAL)
							|| owner.getInventory().contains(stack -> stack.is(Items.ENDER_EYE) || stack.is(Items.ENDER_PEARL)
									|| stack.is(Items.BLAZE_POWDER) || stack.is(Items.BLAZE_ROD))) {
						throw new AssertionError("Expected a vanilla portal completed from the two crafted eyes and the same living dog in the End");
					}
				});
				context.takeScreenshot("expedition-survival-end-entry");
				System.out.printf("Expedition native End entry passed: dog=%s owner=%s%n", fixture.dogId(), ownerId);
				return;
			}
			if ("failed".equals(result)) break;
			context.waitTicks(5);
		}
		throw new AssertionError("The controller did not complete and cross the native End portal");
	}

	private record Fixture(BlockPos landing, BlockPos center, UUID dogId, int runtimeId) {
	}
}
