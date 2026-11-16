package dev.alicon.mushroomyorkie.entity;

import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import dev.alicon.mushroomyorkie.MushroomTheYorkie;
import java.io.IOException;
import java.lang.reflect.Field;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
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
	private Vec3 previous;
	private int ticks, stableTicks, firstCling = -1;
	private double climbingDistance, peakY, largestDrop;

	SquirrelRouteProbe(GameTestHelper helper, SquirrelEntity squirrel, String label, long seed) {
		this.helper = helper;
		this.squirrel = squirrel;
		this.label = label;
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
		this.report.add("frames", this.frames);
		this.save(false);
	}

	void start() {
		this.helper.runAfterDelay(1, this::tick);
	}

	private void tick() {
		this.ticks++;
		try {
			boolean isClimbing = this.climbing.getBoolean(this.goal);
			Vec3 position = this.squirrel.position();
			if (isClimbing && !this.squirrel.hasFoundTree()) {
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
			frame.addProperty("foundTree", this.squirrel.hasFoundTree());
			frame.addProperty("noGravity", this.squirrel.isNoGravity());
			frame.addProperty("onGround", this.squirrel.onGround());
			frame.addProperty("navigationDone", this.squirrel.getNavigation().isDone());
			var path = this.squirrel.getNavigation().getPath();
			frame.addProperty("path", path == null ? "none" : path.toString());
			if (path != null && path.getEndNode() != null) {
				var node = path.getEndNode();
				frame.add("pathEnd", point(new Vec3(node.x, node.y, node.z).subtract(this.origin)));
			}
			BlockPos approachPos = (BlockPos) this.approach.get(this.goal);
			BlockPos climbPos = (BlockPos) this.climb.get(this.goal);
			if (approachPos != null) frame.add("approach", point(Vec3.atBottomCenterOf(approachPos).subtract(this.origin)));
			if (climbPos != null) frame.add("climb", point(Vec3.atCenterOf(climbPos).subtract(this.origin)));
			var movement = this.squirrel.getMoveControl();
			frame.addProperty("hasWanted", movement.hasWanted());
			frame.add("wanted", point(new Vec3(movement.getWantedX(), movement.getWantedY(), movement.getWantedZ()).subtract(this.origin)));
			this.frames.add(frame);
			this.helper.assertTrue(this.squirrel.isAlive() && this.squirrel.getHealth() == this.squirrel.getMaxHealth(), "Squirrel route lost health");
			boolean clinging = this.squirrel.hasFoundTree() && this.squirrel.isNoGravity()
					&& position.y >= this.origin.y + 4.8D;
			if (clinging && this.firstCling < 0) this.firstCling = this.ticks;
			this.stableTicks = clinging ? this.stableTicks + 1 : 0;
			if (this.stableTicks >= 40) {
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
			throw new IllegalStateException("Native squirrel route failed: " + this.label, failure);
		}
		this.start();
	}

	private void save(boolean complete) {
		this.report.addProperty("complete", complete);
		this.report.addProperty("passed", complete && !this.report.has("error"));
		this.report.addProperty("firstCling", this.firstCling);
		this.report.addProperty("climbingDistance", this.climbingDistance);
		this.report.addProperty("largestDrop", this.largestDrop);
		if (this.output == null) return;
		try {
			Files.createDirectories(this.output.getParent());
			Path temporary = this.output.resolveSibling(this.output.getFileName() + ".tmp");
			Files.writeString(temporary, new GsonBuilder().setPrettyPrinting().create().toJson(this.report) + "\n");
			Files.move(temporary, this.output, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
		} catch (IOException failure) {
			throw new IllegalStateException("Could not preserve native squirrel route evidence", failure);
		}
	}

	private static Field field(String name) throws NoSuchFieldException {
		Field field = SquirrelFindTreeGoal.class.getDeclaredField(name);
		field.setAccessible(true);
		return field;
	}

	private static JsonObject point(Vec3 point) {
		JsonObject value = new JsonObject();
		value.addProperty("x", point.x);
		value.addProperty("y", point.y);
		value.addProperty("z", point.z);
		return value;
	}
}
