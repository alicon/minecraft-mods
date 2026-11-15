package dev.alicon.mushroomyorkie.entity;

import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.world.level.block.Blocks;

/** Shared covered room; callers let native skylight settle before asserting shelter behavior. */
final class RoomGameTestFixture {
	private RoomGameTestFixture() {
	}

	static void build(GameTestHelper helper, int floorWidth, int floorDepth, boolean doorway) {
		for (int x = 0; x <= floorWidth; x++) {
			for (int z = 0; z <= floorDepth; z++) {
				helper.setBlock(x, 1, z, Blocks.STONE);
				if (x <= 4 && z <= 4) {
					helper.setBlock(x, 5, z, Blocks.STONE);
					if (x == 0 || x == 4 || z == 0 || z == 4) {
						for (int y = 2; y <= 4; y++) {
							helper.setBlock(x, y, z, Blocks.STONE);
						}
					}
				}
			}
		}
		if (doorway) {
			helper.setBlock(4, 2, 2, Blocks.AIR);
			helper.setBlock(4, 3, 2, Blocks.AIR);
		}
	}
}
