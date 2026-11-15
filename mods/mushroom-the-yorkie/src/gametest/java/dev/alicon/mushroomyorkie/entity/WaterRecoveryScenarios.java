package dev.alicon.mushroomyorkie.entity;

import net.minecraft.core.BlockPos;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.tags.FluidTags;
import net.minecraft.world.entity.MoverType;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.Vec3;

/** Grounded creative recovery must rise over the bank instead of steering into it below the floor. */
final class WaterRecoveryScenarios {
	private WaterRecoveryScenarios() {
	}

	static void creativeRecoveryReachesDryBank(GameTestHelper helper) {
		for (int x = 0; x <= 10; x++) {
			for (int z = 0; z <= 6; z++) {
				helper.setBlock(x, 3, z, Blocks.STONE);
			}
		}
		for (int x = 3; x <= 7; x++) {
			for (int z = 1; z <= 5; z++) {
				for (int y = 0; y <= 3; y++) {
					helper.setBlock(x, y, z, x >= 4 && x <= 6 && z >= 2 && z <= 4 && y >= 1 ? Blocks.WATER : Blocks.STONE);
				}
			}
		}
		MushroomYorkieEntity yorkie = helper.spawn(ModEntities.MUSHROOM_YORKIE, 5, 1, 3);
		yorkie.setNoAi(true);
		yorkie.setPos(Vec3.atBottomCenterOf(helper.absolutePos(new BlockPos(5, 1, 3))));
		var owner = SurvivalGameTestPlayers.create(helper);
		owner.setGameMode(GameType.CREATIVE);
		owner.getAbilities().flying = false;
		owner.setYRot(0.0F);
		owner.setXRot(0.0F);
		owner.setPos(Vec3.atBottomCenterOf(helper.absolutePos(new BlockPos(0, 4, 3))));
		yorkie.claimFor(owner);
		try {
			helper.assertTrue(MushroomYorkieStateQueries.isWetForSitting(yorkie), "Recovery fixture did not start underwater");
			// Manual NoAI motion does not refresh cached fluid flags; inspect actual blocks after moving.
			for (int tick = 0; tick < 200; tick++) {
				yorkie.tickCount++;
				MushroomFlightController.followFlyingOwner(yorkie);
				yorkie.move(MoverType.SELF, yorkie.getDeltaMovement());
				if (!yorkie.isNoGravity() && !helper.getLevel().getFluidState(yorkie.blockPosition()).is(FluidTags.WATER) && yorkie.getY() >= owner.getY() - 0.1D) {
					break;
				}
			}
			helper.assertTrue(!helper.getLevel().getFluidState(yorkie.blockPosition()).is(FluidTags.WATER) && !yorkie.isNoGravity()
					&& yorkie.getY() >= owner.getY() - 0.1D && yorkie.distanceToSqr(owner) <= 9.0D,
					"Creative water recovery did not settle on the bank: relative=" + yorkie.position().subtract(owner.position()) + ", noGravity=" + yorkie.isNoGravity() + ", cachedWater=" + yorkie.isInWater() + ", fluid=" + helper.getLevel().getFluidState(yorkie.blockPosition()));
			helper.succeed();
		} finally {
			yorkie.discard();
		}
	}
}
