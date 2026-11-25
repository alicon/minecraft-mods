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
	private final Level level;
	private final BlockPos origin;
	private final Direction front;
	private final Direction right;

	KitStructurePlacement(Level level, BlockPos origin, Direction front) {
		this.level = level;
		this.origin = origin;
		this.front = front;
		this.right = front.getClockWise();
	}

	void fill(int minX, int minY, int minZ, int maxX, int maxY, int maxZ, Block block) {
		BlockState state = block.defaultBlockState();
		for (int x = minX; x <= maxX; x++) {
			for (int y = minY; y <= maxY; y++) {
				for (int z = minZ; z <= maxZ; z++) {
					set(x, y, z, state);
				}
			}
		}
	}

	void set(int x, int y, int z, BlockState state) {
		this.level.setBlock(position(x, y, z), state, 3);
	}

	void placeOakDoor(int x, int y, int z, Direction facing) {
		placeDoor(x, y, z, Blocks.OAK_DOOR, facing);
	}

	void placeIronDoor(int x, int y, int z, Direction facing) {
		placeDoor(x, y, z, Blocks.IRON_DOOR, facing);
	}

	void placeFloorButton(int x, int y, int z, Direction facing) {
		set(x, y, z, Blocks.STONE_BUTTON.defaultBlockState()
				.setValue(ButtonBlock.FACE, AttachFace.FLOOR)
				.setValue(ButtonBlock.FACING, facing));
	}

	void placePressurePlate(int x, int y, int z) {
		set(x, y, z, Blocks.STONE_PRESSURE_PLATE.defaultBlockState());
	}

	void placeWallSign(int x, int y, int z, Direction facing, String line0, String line1) {
		BlockPos pos = position(x, y, z);
		this.level.setBlock(pos, Blocks.OAK_WALL_SIGN.defaultBlockState().setValue(WallSignBlock.FACING, facing), 3);
		if (this.level.getBlockEntity(pos) instanceof SignBlockEntity sign) {
			SignText text = sign.getFrontText()
					.setMessage(0, Component.literal(line0))
					.setMessage(1, Component.literal(line1));
			sign.setText(text, true);
		}
	}

	private void placeDoor(int x, int y, int z, Block door, Direction facing) {
		BlockState lower = door.defaultBlockState()
				.setValue(DoorBlock.FACING, facing)
				.setValue(DoorBlock.HALF, DoubleBlockHalf.LOWER)
				.setValue(DoorBlock.OPEN, false);
		BlockState upper = lower.setValue(DoorBlock.HALF, DoubleBlockHalf.UPPER);
		set(x, y, z, lower);
		set(x, y + 1, z, upper);
	}

	BlockPos position(int x, int y, int z) {
		return this.origin.relative(this.right, x).relative(this.front, z).above(y);
	}
}
