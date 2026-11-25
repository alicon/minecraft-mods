package dev.alicon.mushroomyorkie.entity;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Predicate;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.tags.BlockTags;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;

final class SquirrelCanopyPaths {
	private static final int CROWN_RADIUS = 5;
	private static final int CROWN_HEIGHT = 12;
	private static final int NEXT_TREE_RADIUS = 18;
	private static final double MAX_LEAP_DISTANCE_SQR = 4.0D * 4.0D;
	private static final double LEAP_RISE = 1.15D;

	private SquirrelCanopyPaths() {
	}

	static List<Vec3> climb(SquirrelEntity squirrel, BlockPos tree) {
		return surfaceRoute(squirrel, tree, pos -> crown(squirrel, pos));
	}

	static List<Vec3> descend(SquirrelEntity squirrel, BlockPos tree) {
		return surfaceRoute(squirrel, tree, pos -> pos.getY() <= tree.getY()
				&& SquirrelFindTreeGoal.isStandable(squirrel.level(), pos) && !foliage(squirrel.level(), pos.below()));
	}

	private static List<Vec3> surfaceRoute(SquirrelEntity squirrel, BlockPos tree, Predicate<BlockPos> destination) {
		BlockPos start = squirrel.blockPosition();
		var queue = new ArrayDeque<BlockPos>();
		var parents = new HashMap<BlockPos, BlockPos>();
		queue.add(start);
		parents.put(start, start);
		Level level = squirrel.level();
		while (!queue.isEmpty()) {
			BlockPos current = queue.removeFirst();
			if (destination.test(current)) {
				var points = new ArrayList<>(route(start, current, parents));
				Vec3 first = points.getFirst();
				points.set(0, new Vec3(first.x, squirrel.getY(), first.z));
				return points;
			}
			for (Direction direction : Direction.values()) {
				BlockPos next = current.relative(direction);
				if (!parents.containsKey(next) && inCrownBounds(tree, next) && level.hasChunkAt(next)
						&& clear(squirrel, next) && (destination.test(next) || touchesTree(level, next))) {
					parents.put(next, current);
					queue.add(next);
				}
			}
		}
		return List.of();
	}

	static BlockPos nextTree(SquirrelEntity squirrel, BlockPos currentTree) {
		Level level = squirrel.level();
		BlockPos closest = null;
		double bestDistance = NEXT_TREE_RADIUS * NEXT_TREE_RADIUS + 1.0D;
		for (BlockPos pos : BlockPos.betweenClosed(currentTree.offset(-NEXT_TREE_RADIUS, -4, -NEXT_TREE_RADIUS),
				currentTree.offset(NEXT_TREE_RADIUS, 4, NEXT_TREE_RADIUS))) {
			double distance = horizontalDistanceSqr(currentTree, pos);
			// Adjacent columns can belong to the same broad trunk.
			if (distance >= 4.0D && distance < bestDistance && level.hasChunkAt(pos) && isOtherTrunk(level, pos)) {
				closest = pos.immutable();
				bestDistance = distance;
			}
		}
		return closest;
	}

	private static boolean isOtherTrunk(Level level, BlockPos pos) {
		if (!level.getBlockState(pos).is(BlockTags.LOGS) || foliage(level, pos.below())
				|| !level.getBlockState(pos.above()).is(BlockTags.LOGS) || !level.getBlockState(pos.above(2)).is(BlockTags.LOGS)) {
			return false;
		}
		for (Direction face : Direction.Plane.HORIZONTAL) {
			BlockPos approach = pos.relative(face);
			if (SquirrelFindTreeGoal.isStandable(level, approach) && SquirrelFindTreeGoal.findClimbTarget(level, pos, approach) != null) return true;
		}
		return false;
	}

	record Leap(List<Vec3> approach, BlockPos landing) {
	}

	static Leap leapTo(SquirrelEntity squirrel, BlockPos currentTree, BlockPos nextTree) {
		BlockPos start = squirrel.blockPosition();
		Map<BlockPos, BlockPos> reachable = walkableCrown(squirrel, currentTree, nextTree, start);
		Leap best = null;
		double bestCost = Double.MAX_VALUE;
		for (BlockPos pos : BlockPos.betweenClosed(start.offset(-CROWN_RADIUS - 4, -1, -CROWN_RADIUS - 4),
				start.offset(CROWN_RADIUS + 4, 1, CROWN_RADIUS + 4))) {
			if (horizontalDistanceSqr(nextTree, pos) >= horizontalDistanceSqr(currentTree, pos)
					|| horizontalDistanceSqr(nextTree, pos) > CROWN_RADIUS * CROWN_RADIUS || !crown(squirrel, pos)) continue;
			for (BlockPos launch : reachable.keySet()) {
				double gap = horizontalDistanceSqr(launch, pos);
				double cost = gap + 2.0D * horizontalDistanceSqr(start, launch);
				if (gap >= 1.0D && gap <= MAX_LEAP_DISTANCE_SQR && cost < bestCost
						&& !arc(squirrel, Vec3.atBottomCenterOf(launch), pos).isEmpty()) {
					bestCost = cost;
					best = new Leap(route(start, launch, reachable), pos.immutable());
				}
			}
		}
		return best;
	}

	private static Map<BlockPos, BlockPos> walkableCrown(SquirrelEntity squirrel, BlockPos currentTree, BlockPos nextTree, BlockPos start) {
		var queue = new ArrayDeque<BlockPos>();
		var parents = new HashMap<BlockPos, BlockPos>();
		queue.add(start);
		parents.put(start, start);
		while (!queue.isEmpty()) {
			BlockPos current = queue.removeFirst();
			for (Direction side : Direction.Plane.HORIZONTAL) {
				BlockPos next = current.relative(side);
				double fromCurrent = horizontalDistanceSqr(currentTree, next);
				if (!parents.containsKey(next) && fromCurrent <= CROWN_RADIUS * CROWN_RADIUS
						&& fromCurrent <= horizontalDistanceSqr(nextTree, next) && crown(squirrel, next)) {
					parents.put(next, current);
					queue.add(next);
				}
			}
		}
		return parents;
	}

	static List<Vec3> arc(SquirrelEntity squirrel, Vec3 from, BlockPos landing) {
		if (!crown(squirrel, landing)) return List.of();
		Vec3 end = Vec3.atBottomCenterOf(landing);
		Vec3 span = end.subtract(from);
		if (span.horizontalDistanceSqr() > MAX_LEAP_DISTANCE_SQR + 0.5D || Math.abs(span.y) > 1.1D) return List.of();
		int steps = Math.max(8, (int) Math.ceil(span.horizontalDistance() / 0.28D));
		List<Vec3> points = new ArrayList<>(steps);
		Vec3 previous = from;
		for (int i = 1; i <= steps; i++) {
			double portion = i / (double) steps;
			Vec3 point = from.add(span.scale(portion)).add(0.0D, 4.0D * LEAP_RISE * portion * (1.0D - portion), 0.0D);
			if (!stepIsClear(squirrel, previous, point)) return List.of();
			points.add(point);
			previous = point;
		}
		return points;
	}

	static boolean stepIsClear(SquirrelEntity squirrel, Vec3 from, Vec3 to) {
		return squirrel.level().hasChunkAt(BlockPos.containing(to)) && squirrel.level().noCollision(squirrel,
				squirrel.getBoundingBox().move(from.subtract(squirrel.position())).expandTowards(to.subtract(from)));
	}

	static boolean crown(SquirrelEntity squirrel, BlockPos pos) {
		Level level = squirrel.level();
		return level.hasChunkAt(pos) && level.getBlockState(pos.below()).is(BlockTags.LEAVES)
				&& level.canSeeSky(pos) && clear(squirrel, pos);
	}

	private static boolean clear(SquirrelEntity squirrel, BlockPos pos) {
		return squirrel.level().getBlockState(pos).isAir() && squirrel.level().noCollision(squirrel,
				squirrel.getBoundingBox().move(Vec3.atBottomCenterOf(pos).subtract(squirrel.position())));
	}

	private static boolean touchesTree(Level level, BlockPos pos) {
		for (Direction direction : Direction.values()) {
			if (foliage(level, pos.relative(direction))) return true;
		}
		// A squirrel can round the lip above or beneath a leaf block without
		// making a long unsupported traverse or cutting through the corner.
		for (Direction direction : Direction.Plane.HORIZONTAL) {
			if (foliage(level, pos.below().relative(direction)) || foliage(level, pos.above().relative(direction))) return true;
		}
		return false;
	}

	private static boolean foliage(Level level, BlockPos pos) {
		return level.hasChunkAt(pos) && (level.getBlockState(pos).is(BlockTags.LOGS) || level.getBlockState(pos).is(BlockTags.LEAVES));
	}

	private static boolean inCrownBounds(BlockPos tree, BlockPos pos) {
		return horizontalDistanceSqr(tree, pos) <= CROWN_RADIUS * CROWN_RADIUS
				&& pos.getY() >= tree.getY() - 1 && pos.getY() <= tree.getY() + CROWN_HEIGHT;
	}

	private static double horizontalDistanceSqr(BlockPos a, BlockPos b) {
		return a.atY(0).distSqr(b.atY(0));
	}

	private static List<Vec3> route(BlockPos start, BlockPos end, Map<BlockPos, BlockPos> parents) {
		var points = new ArrayDeque<Vec3>();
		for (BlockPos pos = end; !pos.equals(start); pos = parents.get(pos)) points.addFirst(Vec3.atBottomCenterOf(pos));
		points.addFirst(Vec3.atBottomCenterOf(start));
		return List.copyOf(points);
	}
}
