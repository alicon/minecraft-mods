package dev.alicon.mushroomyorkie.entity;

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
		owner.setPos(helper.absoluteVec(new Vec3(9.0D, 4.0D, 3.5D)));
		MushroomYorkieEntity yorkie = helper.spawn(ModEntities.MUSHROOM_YORKIE, 3, 3, 3);
		long seed = GameTestSeeds.apply(yorkie, "surface-under-deck");
		yorkie.setPos(helper.absoluteVec(new Vec3(3.5D, 3.8D, 3.5D)));
		yorkie.claimFor(owner);
		Runnable cleanup = () -> {
			yorkie.discard();
			if (helper.getLevel().getServer().getPlayerList().getPlayer(owner.getUUID()) == owner) {
				helper.getLevel().getServer().getPlayerList().remove(owner);
			}
			owner.discard();
		};
		helper.runAfterDelay(1, () -> {
			try {
				helper.assertTrue(yorkie.isInWater() && !yorkie.isUnderWater(), "Deck control must have a wet body and breathing eyes");
				helper.assertTrue(!yorkie.waterEscape.active(), "Breathing surface swimmer was diverted into obstruction escape");
			} catch (RuntimeException | Error failure) {
				cleanup.run();
				throw failure;
			}
		});
		new BoatBankRecoveryProbe(helper, yorkie, owner, false, false, seed, cleanup).start();
	}
}
