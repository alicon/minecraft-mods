package dev.alicon.copsrobbers.capture;

import dev.alicon.copsrobbers.entity.BankRobberEntity;
import dev.alicon.copsrobbers.entity.ModEntities;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.AABB;

final class PoliceJailLayout {
	private static final int JAIL_RADIUS = 9;
	private static final int DROPOFF_RADIUS = 4;

	private PoliceJailLayout() {
	}

	static PoliceJailDropOff findDropOff(ServerLevel level, BlockPos cruiserPos) {
		BlockPos platform = null;
		for (BlockPos pos : BlockPos.betweenClosed(cruiserPos.offset(-DROPOFF_RADIUS, -2, -DROPOFF_RADIUS), cruiserPos.offset(DROPOFF_RADIUS, 1, DROPOFF_RADIUS))) {
			if (level.getBlockState(pos).is(Blocks.YELLOW_CONCRETE)) {
				platform = pos.immutable();
				break;
			}
		}
		if (platform == null || !hasNearbyDropOffStation(level, platform)) {
			return null;
		}
		return new PoliceJailDropOff(platform, nearestBars(level, platform));
	}

	static boolean isSecureJailSpot(ServerLevel level, BlockPos pos) {
		int bars = 0;
		for (BlockPos nearby : BlockPos.betweenClosed(pos.offset(-2, 0, -2), pos.offset(2, 2, 2))) {
			BlockState state = level.getBlockState(nearby);
			if (state.is(Blocks.IRON_BARS)) {
				bars++;
			}
			if (state.is(Blocks.IRON_DOOR) && state.getOptionalValue(net.minecraft.world.level.block.DoorBlock.OPEN).orElse(false)) {
				return false;
			}
		}
		return bars >= 4;
	}

	static int jailedRobbersNear(ServerLevel level, BlockPos center) {
		return level.getEntities(
				ModEntities.BANK_ROBBER,
				AABB.ofSize(center.getCenter(), JAIL_RADIUS * 2.0D, 6.0D, JAIL_RADIUS * 2.0D),
				BankRobberEntity::isJailed
		).size();
	}

	static List<BlockPos> jailStandingSpots(ServerLevel level, BlockPos center) {
		List<BlockPos> spots = new ArrayList<>();
		for (BlockPos pos : BlockPos.betweenClosed(center.offset(-JAIL_RADIUS, -2, -JAIL_RADIUS), center.offset(JAIL_RADIUS, 4, JAIL_RADIUS))) {
			if (isJailStandingSpot(level, pos)) {
				spots.add(pos.immutable());
			}
		}
		spots.sort(Comparator.comparingDouble(pos -> pos.distSqr(center)));
		return spots;
	}

	private static boolean isJailStandingSpot(ServerLevel level, BlockPos pos) {
		return level.getBlockState(pos).isAir()
				&& level.getBlockState(pos.above()).isAir()
				&& level.getBlockState(pos.below()).is(Blocks.SMOOTH_STONE)
				&& isBetweenOppositeBars(level, pos);
	}

	private static boolean isBetweenOppositeBars(ServerLevel level, BlockPos pos) {
		return hasBarsInBothDirections(level, pos, Direction.NORTH, Direction.SOUTH)
				|| hasBarsInBothDirections(level, pos, Direction.EAST, Direction.WEST);
	}

	private static boolean hasBarsInBothDirections(ServerLevel level, BlockPos pos, Direction first, Direction second) {
		return hasBarsAlong(level, pos, first) && hasBarsAlong(level, pos, second);
	}

	private static boolean hasBarsAlong(ServerLevel level, BlockPos pos, Direction direction) {
		for (int distance = 1; distance <= 6; distance++) {
			if (level.getBlockState(pos.relative(direction, distance)).is(Blocks.IRON_BARS)) {
				return true;
			}
		}
		return false;
	}

	private static boolean hasNearbyDropOffStation(ServerLevel level, BlockPos platform) {
		boolean door = false;
		boolean bars = false;
		for (BlockPos pos : BlockPos.betweenClosed(platform.offset(-10, 0, -10), platform.offset(10, 5, 10))) {
			BlockState state = level.getBlockState(pos);
			door |= state.is(Blocks.IRON_DOOR);
			bars |= state.is(Blocks.IRON_BARS);
			if (door && bars) {
				return true;
			}
		}
		return false;
	}

	private static BlockPos nearestBars(ServerLevel level, BlockPos center) {
		BlockPos nearest = center;
		double nearestDistance = Double.MAX_VALUE;
		for (BlockPos pos : BlockPos.betweenClosed(center.offset(-14, -1, -14), center.offset(14, 5, 14))) {
			if (level.getBlockState(pos).is(Blocks.IRON_BARS)) {
				double distance = pos.distSqr(center);
				if (distance < nearestDistance) {
					nearest = pos.immutable();
					nearestDistance = distance;
				}
			}
		}
		return nearest;
	}
}

record PoliceJailDropOff(BlockPos platform, BlockPos cellCenter) {
}
