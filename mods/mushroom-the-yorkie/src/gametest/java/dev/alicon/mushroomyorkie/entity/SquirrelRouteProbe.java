package dev.alicon.mushroomyorkie.entity;

import static dev.alicon.mushroomyorkie.entity.SquirrelTraceReports.point;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import dev.alicon.mushroomyorkie.MushroomTheYorkie;
import java.lang.reflect.Field;
import java.nio.file.Path;
import net.minecraft.core.BlockPos;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.ai.goal.GoalSelector;
import net.minecraft.world.phys.Vec3;

/** Read-only native goal/path observation; reflection never changes AI state. */
final class SquirrelRouteProbe {
	private final GameTestHelper helper;
	private final SquirrelEntity squirrel;
	private final SquirrelFindTreeGoal goal;
	private final Field approach, climb, climbing;
	private final Vec3 origin;
	private final JsonObject report = new JsonObject();
	private final JsonArray frames = new JsonArray();
	private final Path output;
	private final String label;
	private final Vec3 expectedTree;
	private Vec3 previous;
	private int ticks, stableTicks, firstCling = -1;
	private double climbingDistance, peakY, largestDrop;
	private boolean requiresContinuousApproach, seenApproach;
	private int approachAirborneTicks;
	private Field approachAge;
	private int previousApproachAge = -1;

	SquirrelRouteProbe(GameTestHelper helper, SquirrelEntity squirrel, String label, long seed) {
		this(helper, squirrel, label, seed, null);
	}

	SquirrelRouteProbe(GameTestHelper helper, SquirrelEntity squirrel, String label, long seed, Vec3 expectedTree) {
		this.helper = helper;
		this.squirrel = squirrel;
		this.label = label;
		this.expectedTree = expectedTree;
		this.origin = helper.absoluteVec(Vec3.ZERO);
		this.previous = squirrel.position();
		this.peakY = squirrel.getY();
		try {
			Field selector = Mob.class.getDeclaredField("goalSelector");
			selector.setAccessible(true);
			this.goal = ((GoalSelector) selector.get(squirrel)).getAvailableGoals().stream()
					.map(wrapper -> wrapper.getGoal()).filter(SquirrelFindTreeGoal.class::isInstance)
					.map(SquirrelFindTreeGoal.class::cast).findFirst().orElseThrow();
			this.approach = field("approachPos");
			this.climb = field("climbPos");
			this.climbing = field("climbing");
		} catch (ReflectiveOperationException failure) {
			throw new IllegalStateException("Native squirrel goal inspection is unavailable", failure);
		}
		String directory = System.getenv("MUSHROOM_SQUIRREL_TRACE_DIR");
		this.output = directory == null ? null : Path.of(directory, label + "-" + squirrel.getUUID() + ".json");
		this.report.addProperty("label", label);
		this.report.addProperty("entityUuid", squirrel.getUUID().toString());
		this.report.addProperty("entitySeed", Long.toString(seed));
		this.report.addProperty("worldSeed", Long.toString(helper.getLevel().getSeed()));
		this.report.add("origin", point(this.origin));
		this.report.add("start", point(squirrel.position().subtract(this.origin)));
		if (expectedTree != null) this.report.add("expectedTree", point(expectedTree.subtract(this.origin)));
		this.report.add("frames", this.frames);
		this.save(false);
	}

	void start() {
		this.helper.runAfterDelay(1, this::tick);
	}

	SquirrelRouteProbe requireContinuousApproach() {
		try {
			this.approachAge = field("approachTicks");
		} catch (NoSuchFieldException failure) {
			throw new IllegalStateException("Native approach age inspection is unavailable", failure);
		}
		this.requiresContinuousApproach = true;
		this.report.addProperty("requiresContinuousApproach", true);
		return this;
	}

	private void tick() {
		this.ticks++;
		try {
			boolean isClimbing = this.climbing.getBoolean(this.goal);
			Vec3 position = this.squirrel.position();
			if (isClimbing && !this.squirrel.hasFoundTree()) {
				this.helper.assertTrue(this.squirrel.treePoseDirection() == 1, "Ascending squirrel did not publish the upward trunk pose");
				this.climbingDistance += Math.hypot(position.x - this.previous.x, position.z - this.previous.z);
				this.peakY = Math.max(this.peakY, position.y);
				this.largestDrop = Math.max(this.largestDrop, this.peakY - position.y);
			}
			this.previous = position;
			JsonObject frame = new JsonObject();
			frame.addProperty("tick", this.ticks);
			frame.addProperty("entityTick", this.squirrel.tickCount);
			frame.add("position", point(position.subtract(this.origin)));
			frame.add("velocity", point(this.squirrel.getDeltaMovement()));
			frame.addProperty("health", this.squirrel.getHealth());
			frame.addProperty("climbing", isClimbing);
			frame.addProperty("treePose", this.squirrel.treePoseDirection());
			frame.addProperty("foundTree", this.squirrel.hasFoundTree());
			frame.addProperty("noGravity", this.squirrel.isNoGravity());
			frame.addProperty("onGround", this.squirrel.onGround());
			frame.addProperty("navigationDone", this.squirrel.getNavigation().isDone());
			var path = this.squirrel.getNavigation().getPath();
			frame.addProperty("path", path == null ? "none" : path.toString());
			frame.addProperty("pathIdentity", path == null ? "none" : Integer.toUnsignedString(System.identityHashCode(path)));
			if (path != null && path.getEndNode() != null) {
				var node = path.getEndNode();
				frame.add("pathEnd", point(new Vec3(node.x, node.y, node.z).subtract(this.origin)));
			}
			BlockPos approachPos = (BlockPos) this.approach.get(this.goal);
			BlockPos climbPos = (BlockPos) this.climb.get(this.goal);
			int currentApproachAge = this.approachAge == null ? -1 : this.approachAge.getInt(this.goal);
			if (this.approachAge != null) frame.addProperty("approachTicks", currentApproachAge);
			if (approachPos != null) frame.add("approach", point(Vec3.atBottomCenterOf(approachPos).subtract(this.origin)));
			if (climbPos != null) frame.add("climb", point(Vec3.atCenterOf(climbPos).subtract(this.origin)));
			var movement = this.squirrel.getMoveControl();
			frame.addProperty("hasWanted", movement.hasWanted());
			frame.add("wanted", point(new Vec3(movement.getWantedX(), movement.getWantedY(), movement.getWantedZ()).subtract(this.origin)));
			this.frames.add(frame);
			if (this.requiresContinuousApproach) {
				this.helper.assertTrue(!this.seenApproach || approachPos != null,
						"Squirrel released a reachable stepped approach");
				this.helper.assertTrue(!this.seenApproach || currentApproachAge >= this.previousApproachAge,
						"Squirrel restarted a reachable stepped approach");
				if (approachPos != null) this.previousApproachAge = currentApproachAge;
				this.seenApproach |= approachPos != null;
				if (approachPos != null && !isClimbing && !this.squirrel.onGround() && position.y > this.origin.y + 1.2D) {
					this.approachAirborneTicks++;
				}
			}
			this.helper.assertTrue(this.squirrel.isAlive() && this.squirrel.getHealth() == this.squirrel.getMaxHealth(), "Squirrel route lost health");
			boolean clinging = this.squirrel.hasFoundTree() && this.squirrel.isNoGravity()
					&& position.y >= this.origin.y + 4.8D;
			if (clinging && this.firstCling < 0) this.firstCling = this.ticks;
			this.stableTicks = clinging ? this.stableTicks + 1 : 0;
			if (this.stableTicks >= 40) {
				this.helper.assertTrue(!this.requiresContinuousApproach || this.approachAirborneTicks > 0,
						"Stepped fixture never observed an airborne ground approach");
				if (this.expectedTree != null) {
					this.helper.assertTrue(Math.hypot(position.x - this.expectedTree.x, position.z - this.expectedTree.z) < 1.5D,
							"Squirrel reached a different tree than the reachable fixture control");
				}
				this.helper.assertTrue(this.firstCling <= 100,
						"Squirrel took too long to reach the nearby tree: " + this.firstCling + " ticks");
				this.helper.assertTrue(this.climbingDistance <= 3.0D,
						"Squirrel circled after committing to the clear face: " + this.climbingDistance + " horizontal blocks");
				// A native jump while making wall contact can settle back down.
				// Losing a full block of height is a restarted climb, not that hop.
				this.helper.assertTrue(this.largestDrop <= 1.0D,
						"Squirrel lost its climb and dropped " + this.largestDrop + " blocks");
				this.save(true);
				MushroomTheYorkie.LOGGER.info("Squirrel route={} firstCling={} distance={} drop={} trace={}",
						this.label, this.firstCling, this.climbingDistance, this.largestDrop, this.output);
				this.squirrel.discard();
				this.helper.succeed();
				return;
			}
			if (this.ticks % 10 == 0) this.save(false);
			this.helper.assertTrue(this.ticks < 300, "Squirrel did not finish a healthy stable climb");
		} catch (ReflectiveOperationException | RuntimeException | Error failure) {
			this.report.addProperty("error", failure.toString());
			try {
				this.save(true);
			} catch (RuntimeException saveFailure) {
				failure.addSuppressed(saveFailure);
			} finally {
				this.squirrel.discard();
			}
			throw new IllegalStateException("Native squirrel route failed: " + this.label
					+ " at tick " + this.ticks + ": " + failure.getMessage(), failure);
		}
		this.start();
	}

	private void save(boolean complete) {
		this.report.addProperty("complete", complete);
		this.report.addProperty("passed", complete && !this.report.has("error"));
		this.report.addProperty("firstCling", this.firstCling);
		this.report.addProperty("climbingDistance", this.climbingDistance);
		this.report.addProperty("largestDrop", this.largestDrop);
		this.report.addProperty("approachAirborneTicks", this.approachAirborneTicks);
		SquirrelTraceReports.save(this.output, this.report);
	}

	private static Field field(String name) throws NoSuchFieldException {
		Field field = SquirrelFindTreeGoal.class.getDeclaredField(name);
		field.setAccessible(true);
		return field;
	}

}
