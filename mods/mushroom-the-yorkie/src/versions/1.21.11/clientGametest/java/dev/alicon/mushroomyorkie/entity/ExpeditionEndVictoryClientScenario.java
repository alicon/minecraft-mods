package dev.alicon.mushroomyorkie.entity;

import java.util.Arrays;
import java.util.Comparator;
import java.util.Objects;
import java.util.UUID;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.minecraft.client.gui.screens.WinScreen;
import net.minecraft.commands.arguments.EntityAnchorArgument;
import net.minecraft.core.BlockPos;
import net.minecraft.core.GlobalPos;
import net.minecraft.world.Difficulty;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.boss.enderdragon.EndCrystal;
import net.minecraft.world.entity.boss.enderdragon.EnderDragon;
import net.minecraft.world.entity.boss.enderdragon.EnderDragonPart;
import net.minecraft.world.entity.boss.enderdragon.phases.EnderDragonPhase;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.Vec3;

final class ExpeditionEndVictoryClientScenario {
	private ExpeditionEndVictoryClientScenario() {
	}

	static GlobalPos finishAndReturn(ClientGameTestContext context, TestSingleplayerContext world, UUID ownerId, UUID dogId) {
		var server = world.getServer();
		var podium = prepareCamp(server, ownerId, dogId);
		var camp = podium.offset(16, 1, 2);
		var approach = podium.offset(15, 1, 0);
		context.waitFor(client -> client.player.blockPosition().equals(approach));
		ExpeditionCampClientScenario.placeAndMark(context, server, ownerId, dogId, Level.END, camp);

		var start = podium.east(7).above();
		walk(context, start, false);
		context.waitTicks(5);
		int dragonId = stageFinalStrike(server, ownerId, podium);
		context.waitFor(client -> {
			if (!client.player.getMainHandItem().is(Items.DIAMOND_SWORD)
					|| !(client.level.getEntity(dragonId) instanceof EnderDragon dragon)) return false;
			var player = client.player;
			Arrays.stream(dragon.getSubEntities()).filter(part -> player.isWithinEntityInteractionRange(part, 0))
					.min(Comparator.comparingDouble(part -> part.distanceToSqr(player)))
					.ifPresent(part -> player.lookAt(EntityAnchorArgument.Anchor.EYES, part.getBoundingBox().getCenter()));
			return player.getAttackStrengthScale(0) >= 0.95F
					&& client.hitResult instanceof EntityHitResult hit
					&& hit.getEntity() instanceof EnderDragonPart part && part.parentMob == dragon;
		}, 80);
		context.getInput().pressKey(options -> options.keyAttack);
		var exit = podium.east(2);
		for (int tick = 0; tick < 400; tick += 5) {
			if (verifyVictory(server, ownerId, dogId, camp, exit)) {
				context.takeScreenshot("expedition-dragon-victory");
				walk(context, podium.offset(15, 1, 1), false);
				ExpeditionEndShelterClientScenario.recallFromReach(context, server, dogId);
				walk(context, podium.east(4).above(), false);
				walk(context, exit, true);
				ExpeditionTravelClientGameTest.finishPortalTravel(context, world, Level.END, Level.OVERWORLD);
				ExpeditionTravelClientGameTest.assertDog(server, ownerId, dogId, Level.OVERWORLD, Level.OVERWORLD, false);
				System.out.printf("Expedition native dragon victory and exit passed: original dog=%s%n", dogId);
				context.takeScreenshot("expedition-dragon-exit");
				return GlobalPos.of(Level.END, camp);
			}
			context.waitTicks(5);
		}
		throw new AssertionError("The player's native sword strike did not open the dragon's exit portal");
	}

	private static BlockPos prepareCamp(TestServerContext server, UUID ownerId, UUID dogId) {
		return server.computeOnServer(minecraft -> {
			var end = Objects.requireNonNull(minecraft.getLevel(Level.END));
			var fight = end.getDragonFight().saveData();
			if (fight.dragonKilled()) throw new AssertionError("The dragon fight must still be active");
			var podium = fight.exitPortalLocation().orElseThrow();
			for (BlockPos pos : BlockPos.betweenClosed(podium.offset(4, 0, -2), podium.offset(18, 0, 4))) {
				end.setBlockAndUpdate(pos, Blocks.END_STONE.defaultBlockState());
				for (int height = 1; height <= 3; height++) {
					end.setBlockAndUpdate(pos.above(height), Blocks.AIR.defaultBlockState());
				}
			}
			for (BlockPos pos : BlockPos.betweenClosed(podium.offset(15, 3, 1), podium.offset(18, 3, 4))) {
				end.setBlockAndUpdate(pos, Blocks.OBSIDIAN.defaultBlockState());
			}
			var owner = minecraft.getPlayerList().getPlayer(ownerId);
			var start = Vec3.atBottomCenterOf(podium.offset(15, 1, 0));
			owner.teleportTo(start.x, start.y, start.z);
			var dog = (MushroomYorkieEntity) end.getEntity(dogId);
			dog.setPos(Vec3.atBottomCenterOf(podium.offset(16, 1, 3)));
			dog.setMushroomOrderedToSit(true);
			dog.getNavigation().stop();
			return podium;
		});
	}

	private static int stageFinalStrike(TestServerContext server, UUID ownerId, BlockPos podium) {
		return server.computeOnServer(minecraft -> {
			var end = Objects.requireNonNull(minecraft.getLevel(Level.END));
			var dragon = (EnderDragon) end.getEntity(end.getDragonFight().getDragonUUID());
			Objects.requireNonNull(dragon);
			// Start after the crystal phase and at the last hit. Vanilla still
			// controls the strike, death sequence and creation of the exit.
			for (var crystal : end.getEntitiesOfClass(EndCrystal.class, new AABB(podium).inflate(100))) crystal.discard();
			minecraft.setDifficulty(Difficulty.NORMAL, true);
			var owner = minecraft.getPlayerList().getPlayer(ownerId);
			if (owner.isCreative() || owner.isSpectator()) throw new AssertionError("The final strike requires Survival");
			dragon.setHealth(2);
			// A perched dragon's head reaches about 6.5 blocks forward.
			// Put that hitbox in sword range without placing the player beneath the wings.
			dragon.setPos(owner.position().add(-8.8, 1, 0));
			dragon.setYRot(90);
			dragon.setDeltaMovement(Vec3.ZERO);
			dragon.getPhaseManager().setPhase(EnderDragonPhase.SITTING_SCANNING);
			owner.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.DIAMOND_SWORD));
			return dragon.getId();
		});
	}

	private static boolean verifyVictory(TestServerContext server, UUID ownerId, UUID dogId, BlockPos camp, BlockPos exit) {
		return server.computeOnServer(minecraft -> {
			var end = Objects.requireNonNull(minecraft.getLevel(Level.END));
			var owner = minecraft.getPlayerList().getPlayer(ownerId);
			var dog = (MushroomYorkieEntity) end.getEntity(dogId);
			if (!owner.isAlive() || dog == null || !dog.isAlive() || !dog.belongsTo(owner)
					|| !(dog.isOrderedToSit() || dog.isHoldingExpeditionShelter()) || !dog.blockPosition().closerThan(camp, 3)) {
				String observed = dog == null ? "missing" : dog.blockPosition() + " health=" + dog.getHealth()
						+ " sitting=" + dog.isOrderedToSit() + " shelter=" + dog.isHoldingExpeditionShelter();
				throw new AssertionError("Expected the living owner and the original dog at camp " + camp
						+ ", owner health=" + owner.getHealth() + ", dog=" + observed);
			}
			return end.getDragonFight().saveData().dragonKilled() && end.getBlockState(exit).is(Blocks.END_PORTAL)
					&& owner.getMainHandItem().is(Items.DIAMOND_SWORD) && owner.getMainHandItem().getDamageValue() == 1;
		});
	}

	private static void walk(ClientGameTestContext context, BlockPos destination, boolean portal) {
		var input = context.getInput();
		context.runOnClient(client -> client.player.lookAt(EntityAnchorArgument.Anchor.EYES,
				new Vec3(destination.getX() + 0.5, client.player.getEyeY(), destination.getZ() + 0.5)));
		input.holdKey(options -> options.keyUp);
		try {
			context.waitFor(client -> client.screen instanceof WinScreen || client.level != null
					&& (!client.level.dimension().equals(Level.END)
						|| !portal && client.player.blockPosition().equals(destination)), 100);
		} finally {
			input.releaseKey(options -> options.keyUp);
		}
	}
}
