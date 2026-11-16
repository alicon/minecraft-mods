package dev.alicon.mushroomyorkie.entity;

import net.minecraft.core.BlockPos;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.Vec3;

/** The nearest standable trunk may be unreachable while a farther tree remains usable. */
final class SquirrelReachabilityScenarios {
	private enum Layout { OPEN_NEAR, ENCLOSED_NEAR, FAR_ONLY, CLOSE_AFTER_START }
	private SquirrelReachabilityScenarios() {
	}

	static void alternativeTree(GameTestHelper helper, boolean encloseNearTree) {
		fixture(helper, encloseNearTree ? Layout.ENCLOSED_NEAR : Layout.OPEN_NEAR);
	}

	static void fartherTreeOnly(GameTestHelper helper) {
		fixture(helper, Layout.FAR_ONLY);
	}

	static void closeDuringApproach(GameTestHelper helper) {
		fixture(helper, Layout.CLOSE_AFTER_START);
	}

	static void blockedFaceOnly(GameTestHelper helper) {
		for (int x = 0; x <= 7; x++) {
			for (int z = 0; z <= 7; z++) helper.setBlock(x, 0, z, Blocks.STONE);
		}
		for (int y = 1; y <= 7; y++) {
			for (int z = 3; z <= 5; z++) helper.setBlock(2, y, z, Blocks.STONE);
			helper.setBlock(3, y, 3, Blocks.STONE);
			helper.setBlock(3, y, 5, Blocks.STONE);
			if (y <= 5) helper.setBlock(4, y, 4, Blocks.OAK_LOG);
		}
		SquirrelEntity squirrel = helper.spawn(ModEntities.SQUIRREL, 1, 1, 4);
		squirrel.setPos(helper.absoluteVec(new Vec3(1.5D, 1.0D, 4.5D)));
		boolean scheduled = false;
		try {
			long seed = GameTestSeeds.apply(squirrel, "blocked-near-face");
			new SquirrelRouteProbe(helper, squirrel, "blocked-near-face", seed,
					helper.absoluteVec(new Vec3(4.5D, 1.0D, 4.5D))).start();
			scheduled = true;
		} finally {
			if (!scheduled) squirrel.discard();
		}
	}

	private static void fixture(GameTestHelper helper, Layout layout) {
		for (int x = 0; x <= 7; x++) {
			for (int z = 0; z <= 7; z++) helper.setBlock(x, 0, z, Blocks.STONE);
		}
		for (int y = 1; y <= 5; y++) {
			if (layout != Layout.FAR_ONLY) helper.setBlock(4, y, 4, Blocks.OAK_LOG);
			helper.setBlock(1, y, 0, Blocks.OAK_LOG);
		}
		if (layout == Layout.ENCLOSED_NEAR) enclose(helper);
		SquirrelEntity squirrel = helper.spawn(ModEntities.SQUIRREL, 1, 1, 4);
		squirrel.setPos(helper.absoluteVec(new Vec3(layout == Layout.CLOSE_AFTER_START ? 0.5D : 1.5D, 1.0D, 4.5D)));
		boolean scheduled = false;
		try {
			String label = switch (layout) {
				case OPEN_NEAR -> "open-near-tree";
				case ENCLOSED_NEAR -> "blocked-near-tree";
				case FAR_ONLY -> "farther-tree-only";
				case CLOSE_AFTER_START -> "closed-during-approach";
			};
			long seed = GameTestSeeds.apply(squirrel, label);
			Vec3 expectedTree = helper.absoluteVec(layout == Layout.OPEN_NEAR
					? new Vec3(4.5D, 1.0D, 4.5D) : new Vec3(1.5D, 1.0D, 0.5D));
			if (layout == Layout.CLOSE_AFTER_START) closeRoute(helper, squirrel);
			new SquirrelRouteProbe(helper, squirrel, label, seed, expectedTree).start();
			scheduled = true;
		} finally {
			if (!scheduled) squirrel.discard();
		}
	}

	private static void closeRoute(GameTestHelper helper, SquirrelEntity squirrel) {
		helper.runAfterDelay(4, () -> {
			try {
				var path = squirrel.getNavigation().getPath();
				helper.assertTrue(path != null && path.canReach()
						&& path.getTarget().equals(helper.absolutePos(new BlockPos(3, 1, 4))) && !squirrel.onClimbable(),
						"Route-closure control did not begin the native near-tree approach");
				helper.assertTrue(squirrel.getBoundingBox().maxX < helper.absolutePos(new BlockPos(2, 1, 4)).getX(),
						"Route closure would place a wall through the squirrel");
				enclose(helper);
			} catch (RuntimeException | Error failure) {
				squirrel.discard();
				throw failure;
			}
		});
	}

	private static void enclose(GameTestHelper helper) {
		for (int y = 1; y <= 7; y++) {
			for (int edge = 2; edge <= 6; edge++) {
				helper.setBlock(2, y, edge, Blocks.STONE);
				helper.setBlock(6, y, edge, Blocks.STONE);
				helper.setBlock(edge, y, 2, Blocks.STONE);
				helper.setBlock(edge, y, 6, Blocks.STONE);
			}
		}
	}
}
