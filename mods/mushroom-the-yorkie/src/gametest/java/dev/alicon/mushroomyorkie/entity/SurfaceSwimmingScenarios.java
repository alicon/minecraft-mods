package dev.alicon.mushroomyorkie.entity;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import dev.alicon.mushroomyorkie.MushroomTheYorkie;
import java.util.ArrayDeque;
import net.minecraft.core.BlockPos;
import net.minecraft.tags.FluidTags;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.Vec3;

/** Low headroom over a breathing, moving swimmer must not divert normal following. */
final class SurfaceSwimmingScenarios {
	private SurfaceSwimmingScenarios() {
	}

	static void followUnderDeck(GameTestHelper helper) {
		BoatBankEscapeScenarios.buildPool(helper);
		for (int x = 1; x <= 6; x++) {
			for (int z = 2; z <= 4; z++) {
				helper.setBlock(x, 5, z, Blocks.OAK_PLANKS);
			}
		}
		var owner = SurvivalGameTestPlayers.createWithoutToyCleanup(helper);
		try {
			owner.setPos(helper.absoluteVec(new Vec3(9.0D, 4.0D, 3.5D)));
			MushroomYorkieEntity yorkie = helper.spawn(ModEntities.MUSHROOM_YORKIE, 3, 3, 3);
			try {
				long seed = GameTestSeeds.apply(yorkie, "surface-under-deck");
				yorkie.setPos(helper.absoluteVec(new Vec3(3.5D, 3.8D, 3.5D)));
				yorkie.claimFor(owner);
				observe(helper, yorkie, seed, "placed");
				var recentSamples = new ArrayDeque<JsonObject>();
				Runnable cleanup = () -> {
					yorkie.discard();
					discardOwner(helper, owner);
				};
				// The independent one-tick callback was observed at native tick4.
				// The recurring probe adds tasks while Minecraft walks its runnable
				// map; keep the precondition inside the same first native sample.
				new BoatBankRecoveryProbe(helper, yorkie, owner, false, false, seed, cleanup, sample -> {
					JsonObject frame = SurfaceSwimmingTrace.frame(helper, yorkie, seed, sample);
					recentSamples.addLast(frame);
					if (recentSamples.size() > 25) recentSamples.removeFirst();
					if (System.getenv("MUSHROOM_SURFACE_TRACE") != null) {
						MushroomTheYorkie.LOGGER.info("Native surface sample: {}", frame);
					}
					if (sample == 1) {
						String observation = observe(helper, yorkie, seed, "first-recovery-sample");
						helper.assertTrue(yorkie.isInWater() && !yorkie.isUnderWater(), "Deck control must have a wet body and breathing eyes: " + observation);
					}
					// This clear route keeps making progress, including its brief
					// submergence. Low headroom alone must never take over following.
					if (yorkie.waterEscape.active()) {
						JsonArray history = new JsonArray();
						recentSamples.forEach(history::add);
						MushroomTheYorkie.LOGGER.error("Native surface recent samples: {}", history);
						helper.assertTrue(false, "Unobstructed deck following entered escape: " + observe(helper, yorkie, seed, "unexpected-escape-" + sample));
					}
				}).start();
			} catch (RuntimeException | Error failure) {
				yorkie.discard();
				throw failure;
			}
		} catch (RuntimeException | Error failure) {
			discardOwner(helper, owner);
			throw failure;
		}
	}

	private static void discardOwner(GameTestHelper helper, net.minecraft.server.level.ServerPlayer owner) {
		if (helper.getLevel().getServer().getPlayerList().getPlayer(owner.getUUID()) == owner) {
			helper.getLevel().getServer().getPlayerList().remove(owner);
		}
		owner.discard();
	}

	private static String observe(GameTestHelper helper, MushroomYorkieEntity yorkie, long seed, String stage) {
		Vec3 origin = helper.absoluteVec(Vec3.ZERO);
		BlockPos feet = yorkie.blockPosition();
		BlockPos eyes = BlockPos.containing(yorkie.getX(), yorkie.getEyeY(), yorkie.getZ());
		String observation = "stage=" + stage + ", seed=" + seed + ", world=" + yorkie.level().getGameTime()
				+ ", entityTicks=" + yorkie.tickCount + ", wet=" + yorkie.isInWater() + ", underwater=" + yorkie.isUnderWater()
				+ ", position=" + yorkie.position().subtract(origin) + ", eyeY=" + (yorkie.getEyeY() - origin.y)
				+ ", velocity=" + yorkie.getDeltaMovement() + ", health=" + yorkie.getHealth() + ", air=" + yorkie.getAirSupply()
				+ ", onGround=" + yorkie.onGround() + ", noGravity=" + yorkie.isNoGravity()
				+ ", feetWater=" + yorkie.level().getFluidState(feet).is(FluidTags.WATER)
				+ ", eyeWater=" + yorkie.level().getFluidState(eyes).is(FluidTags.WATER)
				+ ", escape=" + yorkie.waterEscape.active();
		MushroomTheYorkie.LOGGER.info("Native surface setup: {}", observation);
		return observation;
	}
}
