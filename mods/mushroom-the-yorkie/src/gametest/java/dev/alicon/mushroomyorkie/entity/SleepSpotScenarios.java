package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.block.ModBlocks;
import net.minecraft.core.BlockPos;
import net.minecraft.gametest.framework.GameTestHelper;

/** Native paths to low beds must finish at the bed, not on the adjacent floor. */
final class SleepSpotScenarios {
	private SleepSpotScenarios() {
	}

	static void bedApproachPathReachesBed(GameTestHelper helper) {
		RoomGameTestFixture.build(helper, 4, 4, false);
		helper.setBlock(3, 2, 2, ModBlocks.DOG_BED);
		MushroomYorkieEntity yorkie = helper.spawn(ModEntities.MUSHROOM_YORKIE, 1, 2, 2);
		yorkie.setNoAi(true);
		yorkie.setOnGround(true);
		var owner = SurvivalGameTestPlayers.create(helper);
		owner.setPos(yorkie.getX(), yorkie.getY(), yorkie.getZ() - 1);
		yorkie.claimFor(owner);
		helper.runAfterDelay(10, () -> {
			long previousTime = helper.getLevel().getDayTime();
			try {
				helper.getLevel().setDayTime(18000);
				SleepAtNightGoal sleep = new SleepAtNightGoal(yorkie);
				helper.assertTrue(sleep.canUse(), "Dry nighttime bed approach fixture was not eligible");
				sleep.start();
				sleep.tick();
				var path = yorkie.getNavigation().getPath();
				BlockPos target = helper.absolutePos(new BlockPos(3, 2, 2));
				helper.assertTrue(path != null && path.canReach() && path.getEndNode().asBlockPos().equals(target),
						"Bed path stopped before the low-bed target: " + path + (path == null ? "" : ", end=" + path.getEndNode().asBlockPos() + ", target=" + path.getTarget() + ", reachable=" + path.canReach()));
				helper.succeed();
			} finally {
				yorkie.discard();
				helper.getLevel().setDayTime(previousTime);
			}
		});
	}
}
