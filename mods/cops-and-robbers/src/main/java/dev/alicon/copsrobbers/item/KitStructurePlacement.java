package dev.alicon.copsrobbers.item;

import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.network.chat.Component;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.ButtonBlock;
import net.minecraft.world.level.block.DoorBlock;
import net.minecraft.world.level.block.WallSignBlock;
import net.minecraft.world.level.block.entity.SignBlockEntity;
import net.minecraft.world.level.block.entity.SignText;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.AttachFace;
import net.minecraft.world.level.block.state.properties.DoubleBlockHalf;

final class KitStructurePlacement {
	private KitStructurePlacement() {
	}

	static void fill(Level level, BlockPos origin, Direction front, Direction right, int minX, int minY, int minZ, int maxX, int maxY, int maxZ, Block block) {
		BlockState state = block.defaultBlockState();
		for (int x = minX; x <= maxX; x++) {
			for (int y = minY; y <= maxY; y++) {
				for (int z = minZ; z <= maxZ; z++) {
					set(level, origin, front, right, x, y, z, state);
				}
			}
		}
	}

	static void set(Level level, BlockPos origin, Direction front, Direction right, int x, int y, int z, BlockState state) {
		level.setBlock(position(origin, front, right, x, y, z), state, 3);
	}

	static void placeOakDoor(Level level, BlockPos origin, Direction front, Direction right, int x, int y, int z, Direction facing) {
		placeDoor(level, origin, front, right, x, y, z, Blocks.OAK_DOOR, facing);
	}

	static void placeIronDoor(Level level, BlockPos origin, Direction front, Direction right, int x, int y, int z, Direction facing) {
		placeDoor(level, origin, front, right, x, y, z, Blocks.IRON_DOOR, facing);
	}

	static void placeFloorButton(Level level, BlockPos origin, Direction front, Direction right, int x, int y, int z, Direction facing) {
		set(level, origin, front, right, x, y, z, Blocks.STONE_BUTTON.defaultBlockState()
				.setValue(ButtonBlock.FACE, AttachFace.FLOOR)
				.setValue(ButtonBlock.FACING, facing));
	}

	static void placePressurePlate(Level level, BlockPos origin, Direction front, Direction right, int x, int y, int z) {
		set(level, origin, front, right, x, y, z, Blocks.STONE_PRESSURE_PLATE.defaultBlockState());
	}

	static void placeWallSign(Level level, BlockPos origin, Direction front, Direction right, int x, int y, int z, Direction facing, String line0, String line1) {
		BlockPos pos = position(origin, front, right, x, y, z);
		level.setBlock(pos, Blocks.OAK_WALL_SIGN.defaultBlockState().setValue(WallSignBlock.FACING, facing), 3);
		if (level.getBlockEntity(pos) instanceof SignBlockEntity sign) {
			SignText text = sign.getFrontText()
					.setMessage(0, Component.literal(line0))
					.setMessage(1, Component.literal(line1));
			sign.setText(text, true);
		}
	}

	private static void placeDoor(Level level, BlockPos origin, Direction front, Direction right, int x, int y, int z, Block door, Direction facing) {
		BlockState lower = door.defaultBlockState()
				.setValue(DoorBlock.FACING, facing)
				.setValue(DoorBlock.HALF, DoubleBlockHalf.LOWER)
				.setValue(DoorBlock.OPEN, false);
		BlockState upper = lower.setValue(DoorBlock.HALF, DoubleBlockHalf.UPPER);
		set(level, origin, front, right, x, y, z, lower);
		set(level, origin, front, right, x, y + 1, z, upper);
	}

	private static BlockPos position(BlockPos origin, Direction front, Direction right, int x, int y, int z) {
		return origin.relative(right, x).relative(front, z).above(y);
	}
}
