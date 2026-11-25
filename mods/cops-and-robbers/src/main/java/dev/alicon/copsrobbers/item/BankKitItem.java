package dev.alicon.copsrobbers.item;

import dev.alicon.copsrobbers.entity.ModEntities;
import dev.alicon.copsrobbers.entity.TellerEntity;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.Container;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.ChestBlock;
import net.minecraft.world.level.block.LanternBlock;
import net.minecraft.world.level.block.state.BlockState;

/** Places a burnable bank with a teller counter and gold vault. */
public final class BankKitItem extends StructureKitItem {
	private static final int[] TELLER_OFFSETS = {-3, 0, 3};

	/** Registry constructor; gameplay structure contents are encoded in this item rather than config. */
	public BankKitItem(Properties properties) {
		super(properties);
	}

	@Override
	void place(Level level, BlockPos origin, Direction front) {
		placeBank(level, origin, front);
		if (level instanceof ServerLevel serverLevel) {
			spawnTellers(serverLevel, origin, front);
		}
	}

	private static void placeBank(Level level, BlockPos origin, Direction front) {
		KitStructurePlacement structure = new KitStructurePlacement(level, origin, front);
		structure.fill(-7, 0, -4, 7, 0, 11, Blocks.OAK_PLANKS);
		structure.fill(-7, 1, 11, 7, 4, 11, Blocks.WHITE_WOOL);
		structure.fill(-7, 1, -4, -7, 4, 11, Blocks.WHITE_WOOL);
		structure.fill(7, 1, -4, 7, 4, 11, Blocks.WHITE_WOOL);
		structure.fill(-7, 4, -4, 7, 4, 11, Blocks.OAK_PLANKS);
		structure.fill(-7, 1, -4, -2, 3, -4, Blocks.OAK_LOG);
		structure.fill(2, 1, -4, 7, 3, -4, Blocks.OAK_LOG);
		structure.fill(-1, 3, -4, 1, 3, -4, Blocks.OAK_LOG);
		structure.fill(-6, 1, -3, 6, 3, 10, Blocks.AIR);
		structure.fill(0, 1, -4, 0, 2, -4, Blocks.AIR);
		structure.fill(-1, 1, -4, -1, 2, -4, Blocks.GLASS);
		structure.fill(1, 1, -4, 1, 2, -4, Blocks.GLASS);
		structure.set(0, 0, -5, Blocks.OAK_PLANKS.defaultBlockState());
		structure.placeOakDoor(0, 1, -4, front);
		structure.set(0, 1, -5, Blocks.OAK_PRESSURE_PLATE.defaultBlockState());
		structure.fill(-5, 2, -4, -3, 2, -4, Blocks.GLASS_PANE);
		structure.fill(3, 2, -4, 5, 2, -4, Blocks.GLASS_PANE);
		structure.fill(-7, 2, 0, -7, 2, 3, Blocks.GLASS_PANE);
		structure.fill(7, 2, 0, 7, 2, 3, Blocks.GLASS_PANE);

		// Teller counter and lobby.
		structure.fill(-5, 1, 1, 5, 1, 1, Blocks.OAK_PLANKS);
		structure.fill(-5, 2, 1, 5, 2, 1, Blocks.OAK_SLAB);
		openTellerSightlines(structure);
		structure.fill(-4, 1, -2, 4, 1, -2, Blocks.RED_CARPET);

		// Vault in the rear with bars and gold inside.
		structure.fill(-5, 1, 5, 5, 3, 9, Blocks.IRON_BARS);
		structure.fill(-4, 1, 6, 4, 2, 8, Blocks.AIR);
		structure.fill(-3, 1, 8, 3, 1, 8, Blocks.CHEST);
		stockVaultChests(level, front, structure);
		structure.fill(0, 1, 5, 1, 2, 5, Blocks.AIR);

		// Bank colors and burnable trim.
		structure.fill(-7, 1, -3, 7, 1, -3, Blocks.OAK_LOG);
		structure.set(0, 1, -3, Blocks.OAK_PRESSURE_PLATE.defaultBlockState());
		structure.set(-1, 5, -4, Blocks.GOLD_BLOCK.defaultBlockState());
		structure.set(0, 5, -4, Blocks.WHITE_WOOL.defaultBlockState());
		structure.set(1, 5, -4, Blocks.GOLD_BLOCK.defaultBlockState());
		structure.placeWallSign(0, 4, -5, front.getOpposite(), "Village", "Bank");

		// Warm old-school lantern lighting.
		BlockState lantern = Blocks.LANTERN.defaultBlockState().setValue(LanternBlock.HANGING, true);
		structure.set(-4, 3, 0, lantern);
		structure.set(4, 3, 0, lantern);
		structure.set(0, 3, 7, lantern);
	}

	/** Places a bank structure and tellers at the supplied origin. */
	public static void placeBankWithTellers(ServerLevel level, BlockPos origin, Direction front) {
		placeBank(level, origin, front);
		spawnTellers(level, origin, front);
	}

	/** Recreates bank tellers if an older generated bank is missing them. */
	public static void ensureTellers(ServerLevel level, BlockPos origin, Direction front) {
		KitStructurePlacement structure = new KitStructurePlacement(level, origin, front);
		BlockPos center = origin.relative(front, 3);
		openTellerSightlines(structure);
		int existing = level.getEntities(ModEntities.TELLER, net.minecraft.world.phys.AABB.ofSize(center.getCenter(), 18.0D, 6.0D, 18.0D), TellerEntity::isAlive).size();
		if (existing < 3) {
			spawnTellers(level, origin, front);
		}
	}

	private static void openTellerSightlines(KitStructurePlacement structure) {
		for (int x : TELLER_OFFSETS) {
			structure.set(x, 2, 1, Blocks.AIR.defaultBlockState());
		}
	}

	private static void spawnTellers(ServerLevel level, BlockPos origin, Direction front) {
		Direction right = front.getClockWise();
		for (int x : TELLER_OFFSETS) {
			BlockPos pos = origin.relative(right, x).relative(front, 3).above();
			TellerEntity teller = ModEntities.TELLER.create(level, EntitySpawnReason.EVENT);
			if (teller != null) {
				teller.snapTo(pos.getX() + 0.5D, pos.getY(), pos.getZ() + 0.5D, front.toYRot(), 0.0F);
				teller.setCounterPos(pos);
				level.addFreshEntity(teller);
			}
		}
	}

	private static void stockVaultChests(Level level, Direction front, KitStructurePlacement structure) {
		BlockState chest = Blocks.CHEST.defaultBlockState().setValue(ChestBlock.FACING, front.getOpposite());
		for (int x = -3; x <= 3; x++) {
			BlockPos pos = structure.position(x, 1, 8);
			level.setBlock(pos, chest, 3);
			if (level.getBlockEntity(pos) instanceof Container container) {
				container.setItem(0, new ItemStack(Items.GOLD_INGOT, 8));
				container.setChanged();
			}
		}
	}
}
