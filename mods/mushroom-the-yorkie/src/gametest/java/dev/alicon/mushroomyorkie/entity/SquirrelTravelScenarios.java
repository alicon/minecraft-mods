package dev.alicon.mushroomyorkie.entity;

import net.minecraft.core.BlockPos;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.LeavesBlock;
import net.minecraft.world.level.block.SaplingBlock;
import net.minecraft.world.phys.Vec3;

final class SquirrelTravelScenarios {
	private SquirrelTravelScenarios() {
	}

	static void movesBetweenTrees(GameTestHelper helper, boolean wideGap) {
		int secondTrunk = wideGap ? 18 : 11;
		for (int x = 0; x <= 24; x++) {
			for (int z = 0; z <= 7; z++) helper.setBlock(x, 0, z, Blocks.STONE);
		}
		buildTree(helper, 4);
		buildTree(helper, secondTrunk);
		var squirrel = helper.spawn(ModEntities.SQUIRREL, 1, 1, 4);
		Vec3 originalCrown = helper.absoluteVec(new Vec3(4.5D, 6.0D, 4.5D));
		Vec3 nextCrown = helper.absoluteVec(new Vec3(secondTrunk + 0.5D, 6.0D, 4.5D));
		boolean[] firstCrownReached = {false};
		boolean[] crossedGap = {false};
		helper.onEachTick(() -> {
			if (squirrel.getY() >= originalCrown.y - 0.1D && squirrel.distanceToSqr(originalCrown) < 9.0D) firstCrownReached[0] = true;
			double along = squirrel.position().subtract(originalCrown).dot(nextCrown.subtract(originalCrown).normalize());
			if (firstCrownReached[0] && along > 2.75D && along < secondTrunk - 6.5D) {
				crossedGap[0] |= wideGap ? squirrel.getY() < originalCrown.y - 3.5D : squirrel.getY() > originalCrown.y + 0.4D;
			}
		});
		helper.succeedWhen(() -> {
			helper.assertTrue(firstCrownReached[0], "Native squirrel never got onto the first crown: " + squirrel.position());
			helper.assertTrue(crossedGap[0], "Squirrel did not " + (wideGap ? "descend and cross the ground" : "leap across the crown gap")
					+ ": " + squirrel.position());
			helper.assertTrue(squirrel.hasFoundTree() && Math.abs(squirrel.getX() - nextCrown.x) <= 2.6D
					&& Math.abs(squirrel.getZ() - nextCrown.z) <= 2.6D && squirrel.getY() >= nextCrown.y - 2.5D,
					"Squirrel did not reach the second tree: " + squirrel.position());
			squirrel.discard();
		});
	}

	static void plantsDroppedSapling(GameTestHelper helper) {
		for (int x = 1; x <= 12; x++) {
			for (int z = 1; z <= 7; z++) helper.setBlock(x, 0, z, Blocks.DIRT);
		}
		var squirrel = helper.spawn(ModEntities.SQUIRREL, 4, 1, 4);
		Vec3 location = helper.absoluteVec(new Vec3(5.5D, 1.0D, 4.5D));
		var item = new ItemEntity(helper.getLevel(), location.x, location.y, location.z, new ItemStack(Items.OAK_SAPLING, 3));
		item.setDeltaMovement(Vec3.ZERO);
		helper.getLevel().addFreshEntity(item);
		helper.succeedWhen(() -> {
			BlockPos planted = null;
			for (BlockPos relative : BlockPos.betweenClosed(1, 1, 1, 12, 1, 7)) {
				BlockPos pos = helper.absolutePos(relative);
				if (helper.getLevel().getBlockState(pos).is(Blocks.OAK_SAPLING)) planted = pos;
			}
			helper.assertTrue(planted != null, "Squirrel never planted a native oak sapling: " + squirrel.position()
					+ ", source=" + item.getItem() + ", carried=" + squirrel.getMainHandItem() + ", active path=" + squirrel.getNavigation().getTargetPos()
					+ ", griefing=" + SquirrelMobGriefing.canPlant(helper.getLevel()) + ", sky=" + helper.getLevel().canSeeSky(squirrel.blockPosition()));
			helper.assertTrue(item.getItem().getCount() == 2 && squirrel.getMainHandItem().isEmpty(), "Planting did not consume exactly one dropped sapling");
			var level = helper.getLevel();
			var sapling = (SaplingBlock) Blocks.OAK_SAPLING;
			var random = RandomSource.create(42L);
			sapling.performBonemeal(level, random, planted, level.getBlockState(planted));
			sapling.performBonemeal(level, random, planted, level.getBlockState(planted));
			helper.assertTrue(level.getBlockState(planted).is(Blocks.OAK_LOG), "A buried sapling could not grow into a native tree");
			squirrel.discard();
			item.discard();
		});
	}

	private static void buildTree(GameTestHelper helper, int x) {
		for (int y = 1; y <= 5; y++) helper.setBlock(x, y, 4, Blocks.OAK_LOG);
		for (int dx = -2; dx <= 2; dx++) {
			for (int dz = -2; dz <= 2; dz++) {
				if (dx != 0 || dz != 0) helper.setBlock(new BlockPos(x + dx, 5, 4 + dz),
						Blocks.OAK_LEAVES.defaultBlockState().setValue(LeavesBlock.PERSISTENT, true));
			}
		}
	}
}
