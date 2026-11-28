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
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.NetherPortalBlock;

final class ExpeditionPortalClientScenario {
	private ExpeditionPortalClientScenario() {
	}

	static void run(ClientGameTestContext context, TestServerContext server, UUID ownerId, Path status) throws IOException {
		var fixture = server.computeOnServer(minecraft -> {
			var owner = Objects.requireNonNull(minecraft.getPlayerList().getPlayer(ownerId));
			var home = minecraft.overworld();
			var nether = Objects.requireNonNull(minecraft.getLevel(Level.NETHER));
			var origin = owner.blockPosition().above(6);
			var destination = new BlockPos(Math.floorDiv(origin.getX(), 8), origin.getY(), Math.floorDiv(origin.getZ(), 8));
			preparePortal(home, origin, false);
			preparePortal(nether, destination, true);
			var landing = origin.south(3);
			owner.teleportTo(landing.getX() + 0.5, landing.getY(), landing.getZ() + 0.5);
			owner.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.FLINT_AND_STEEL));
			owner.getInventory().add(new ItemStack(Items.OBSIDIAN));
			var dog = Objects.requireNonNull(ModEntities.MUSHROOM_YORKIE.create(home, EntitySpawnReason.TRIGGERED));
			dog.claimFor(owner);
			dog.setPos(landing.getX() + 1.5, landing.getY(), landing.getZ() + 0.5);
			home.addFreshEntity(dog);
			return new Fixture(origin, landing, dog.getUUID(), dog.getId());
		});
		context.waitFor(client -> client.player.blockPosition().equals(fixture.landing())
				&& client.player.getMainHandItem().is(Items.FLINT_AND_STEEL)
				&& client.level.getEntity(fixture.runtimeId()) instanceof MushroomYorkieEntity);
		Files.writeString(status.resolveSibling("portal-companion"), fixture.dogId().toString());
		Files.writeString(status, "ready");
		boolean togetherInNether = false;
		for (int tick = 0; tick < 1_600; tick += 5) {
			String result = Files.readString(status);
			togetherInNether |= server.computeOnServer(minecraft -> {
				var owner = minecraft.getPlayerList().getPlayer(ownerId);
				return owner.level().dimension().equals(Level.NETHER)
						&& validDog(owner, owner.level().getEntity(fixture.dogId()));
			});
			if ("finished".equals(result)) {
				if (!togetherInNether) throw new AssertionError("The original dog never reached the Nether with its owner");
				server.runOnServer(minecraft -> {
					var owner = minecraft.getPlayerList().getPlayer(ownerId);
					var home = minecraft.overworld();
					if (!owner.level().dimension().equals(Level.OVERWORLD)
							|| !validDog(owner, home.getEntity(fixture.dogId()))
							|| !home.getBlockState(fixture.origin().west().above(2)).is(Blocks.OBSIDIAN)
							|| !home.getBlockState(fixture.origin()).is(Blocks.NETHER_PORTAL)
							|| !owner.getInventory().contains(stack -> stack.is(Items.FLINT_AND_STEEL) && stack.isDamaged())) {
						throw new AssertionError("Expected the repaired, lit frame and the same living dog and owner back home");
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

	private record Fixture(BlockPos origin, BlockPos landing, UUID dogId, int runtimeId) {
	}
}
