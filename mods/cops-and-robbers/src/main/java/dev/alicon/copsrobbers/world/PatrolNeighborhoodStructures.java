package dev.alicon.copsrobbers.world;

import dev.alicon.copsrobbers.item.FireStationKitItem;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.DoorBlock;
import net.minecraft.world.level.block.LanternBlock;
import net.minecraft.world.level.block.WallSignBlock;
import net.minecraft.world.level.block.entity.SignBlockEntity;
import net.minecraft.world.level.block.entity.SignText;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.DoubleBlockHalf;

final class PatrolNeighborhoodStructures {
	private PatrolNeighborhoodStructures() {
	}

	static void buildHideout(ServerLevel level, BlockPos center) {
		fill(level, center, -5, 1, -4, 5, 1, 4, Blocks.MOSSY_COBBLESTONE);
		fill(level, center, -5, 2, -4, 5, 3, -4, Blocks.OAK_PLANKS);
		fill(level, center, -5, 2, 4, 5, 3, 4, Blocks.OAK_PLANKS);
		fill(level, center, -5, 2, -3, -5, 3, 4, Blocks.MOSSY_COBBLESTONE);
		fill(level, center, 5, 2, -4, 5, 3, 4, Blocks.OAK_PLANKS);
		fill(level, center, -4, 4, -3, 4, 4, 3, Blocks.OAK_SLAB);
		fill(level, center, -4, 2, -3, 4, 3, 3, Blocks.AIR);
		set(level, center, 0, 1, 5, Blocks.OAK_PLANKS);
		placeOakDoor(level, center, 0, 2, 4, Direction.SOUTH);
		set(level, center, 0, 2, 5, Blocks.OAK_PRESSURE_PLATE);
		set(level, center, 0, 2, 3, Blocks.OAK_PRESSURE_PLATE);
		fill(level, center, -3, 3, -4, -2, 3, -4, Blocks.GLASS_PANE);
		fill(level, center, 2, 3, -4, 3, 3, -4, Blocks.GLASS_PANE);
		fill(level, center, 5, 3, -1, 5, 3, 1, Blocks.GLASS_PANE);
		placeSign(level, center, 0, 4, 5, Direction.SOUTH, "Robber", "Hideout");
		level.setBlock(center.offset(0, 2, 0), Blocks.CHEST.defaultBlockState(), 3);
		set(level, center, -3, 3, -2, Blocks.LANTERN.defaultBlockState().setValue(LanternBlock.HANGING, true));
		set(level, center, 3, 3, 2, Blocks.LANTERN.defaultBlockState().setValue(LanternBlock.HANGING, true));
		level.setBlock(center.offset(4, 2, -2), Blocks.COBWEB.defaultBlockState(), 3);
		level.setBlock(center.offset(2, 2, 3), Blocks.COBWEB.defaultBlockState(), 3);
		level.setBlock(center.offset(-1, 2, -2), Blocks.MOSSY_COBBLESTONE.defaultBlockState(), 3);
	}

	static void buildFireStation(ServerLevel level, BlockPos center) {
		FireStationKitItem.placeFireStation(level, center, Direction.NORTH);
	}

	private static void fill(ServerLevel level, BlockPos center, int minX, int minY, int minZ, int maxX, int maxY, int maxZ, Block block) {
		for (int x = minX; x <= maxX; x++) {
			for (int y = minY; y <= maxY; y++) {
				for (int z = minZ; z <= maxZ; z++) {
					level.setBlock(center.offset(x, y, z), block.defaultBlockState(), 3);
				}
			}
		}
	}

	private static void set(ServerLevel level, BlockPos center, int x, int y, int z, Block block) {
		level.setBlock(center.offset(x, y, z), block.defaultBlockState(), 3);
	}

	private static void set(ServerLevel level, BlockPos center, int x, int y, int z, BlockState state) {
		level.setBlock(center.offset(x, y, z), state, 3);
	}

	private static void placeIronDoor(ServerLevel level, BlockPos center, int x, int y, int z, Direction facing) {
		placeDoor(level, center, x, y, z, facing, Blocks.IRON_DOOR.defaultBlockState());
	}

	private static void placeOakDoor(ServerLevel level, BlockPos center, int x, int y, int z, Direction facing) {
		placeDoor(level, center, x, y, z, facing, Blocks.OAK_DOOR.defaultBlockState());
	}

	private static void placeDoor(ServerLevel level, BlockPos center, int x, int y, int z, Direction facing, BlockState base) {
		BlockState lower = base.setValue(DoorBlock.FACING, facing).setValue(DoorBlock.HALF, DoubleBlockHalf.LOWER);
		BlockState upper = lower.setValue(DoorBlock.HALF, DoubleBlockHalf.UPPER);
		set(level, center, x, y, z, lower);
		set(level, center, x, y + 1, z, upper);
	}

	private static void placeSign(ServerLevel level, BlockPos center, int x, int y, int z, Direction facing, String line0, String line1) {
		BlockPos pos = center.offset(x, y, z);
		level.setBlock(pos, Blocks.OAK_WALL_SIGN.defaultBlockState().setValue(WallSignBlock.FACING, facing), 3);
		if (level.getBlockEntity(pos) instanceof SignBlockEntity sign) {
			SignText text = sign.getFrontText()
					.setMessage(0, Component.literal(line0))
					.setMessage(1, Component.literal(line1));
			sign.setText(text, true);
		}
	}
}
