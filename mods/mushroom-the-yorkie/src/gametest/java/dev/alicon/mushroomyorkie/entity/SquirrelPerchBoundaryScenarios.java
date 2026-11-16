package dev.alicon.mushroomyorkie.entity;

import static dev.alicon.mushroomyorkie.entity.SquirrelTraceReports.point;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import java.nio.file.Path;
import java.util.function.UnaryOperator;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.Vec3;

/** Artificial saved-flag inputs check rejection boundaries, followed by normal native ticks. */
final class SquirrelPerchBoundaryScenarios {
	private SquirrelPerchBoundaryScenarios() {
	}

	static void observe(GameTestHelper helper, UnaryOperator<SquirrelEntity> roundTrip, String boundary) {
		for (int x = 0; x <= 7; x++) {
			for (int z = 0; z <= 7; z++) helper.setBlock(x, 0, z, Blocks.STONE);
		}
		for (int y = 1; y <= (boundary.equals("short-column") ? 2 : 5); y++) helper.setBlock(4, y, 4, Blocks.OAK_LOG);
		SquirrelEntity original = helper.spawn(ModEntities.SQUIRREL, 1, 1, 4);
		GameTestSeeds.apply(original, boundary);
		// These are malformed saved-perch inputs, not an observed climb or knockback.
		Vec3 position = switch (boundary) {
			case "horizontal-gap" -> new Vec3(3.75D, 4.9D, 4.5D);
			case "above-log" -> new Vec3(3.81D, 6.2D, 4.5D);
			case "short-column" -> new Vec3(3.81D, 1.9D, 4.5D);
			default -> throw new IllegalArgumentException("Unknown perch boundary " + boundary);
		};
		original.setPos(helper.absoluteVec(position));
		original.setNoGravity(true);
		SquirrelEntity restored = roundTrip.apply(original);
		helper.assertTrue(original.getUUID().equals(restored.getUUID()) && restored.isNoGravity(), "Saved boundary input changed");
		new Probe(helper, restored, boundary).start();
	}

	private static final class Probe {
		private final GameTestHelper helper;
		private final SquirrelEntity squirrel;
		private final JsonObject report = new JsonObject();
		private final JsonArray frames = new JsonArray();
		private final Path output;
		private boolean falling;
		private int ticks;

		Probe(GameTestHelper helper, SquirrelEntity squirrel, String boundary) {
			this.helper = helper;
			this.squirrel = squirrel;
			String directory = System.getenv("MUSHROOM_SQUIRREL_TRACE_DIR");
			this.output = directory == null ? null : Path.of(directory, "native-perch-boundary-" + boundary + "-" + squirrel.getUUID() + ".json");
			this.report.addProperty("boundary", boundary);
			this.report.addProperty("artificialSavedFlagInput", true);
			this.report.addProperty("entityUuid", squirrel.getUUID().toString());
			this.report.add("frames", this.frames);
		}

		void start() {
			this.helper.runAfterDelay(1, this::tick);
		}

		private void tick() {
			this.ticks++;
			try {
				JsonObject frame = new JsonObject();
				frame.addProperty("tick", this.ticks);
				frame.addProperty("health", this.squirrel.getHealth());
				frame.addProperty("noGravity", this.squirrel.isNoGravity());
				frame.addProperty("foundTree", this.squirrel.hasFoundTree());
				frame.addProperty("onGround", this.squirrel.onGround());
				frame.add("position", point(this.squirrel.position().subtract(this.helper.absoluteVec(Vec3.ZERO))));
				frame.add("velocity", point(this.squirrel.getDeltaMovement()));
				this.frames.add(frame);
				this.helper.assertTrue(this.squirrel.isAlive(), "Boundary squirrel died before landing");
				if (this.ticks >= 5) this.helper.assertTrue(!this.squirrel.isNoGravity() && !this.squirrel.hasFoundTree(),
						"Invalid saved perch was reclaimed");
				this.falling |= !this.squirrel.isNoGravity() && this.squirrel.getDeltaMovement().y < -0.2D;
				if (this.falling && this.squirrel.onGround()) {
					this.save(true);
					this.squirrel.discard();
					this.helper.succeed();
					return;
				}
				this.helper.assertTrue(this.ticks < 80, "Invalid saved perch did not restore ordinary fall and landing");
			} catch (RuntimeException | Error failure) {
				this.report.addProperty("error", failure.toString());
				try {
					this.save(true);
				} catch (RuntimeException saveFailure) {
					failure.addSuppressed(saveFailure);
				} finally {
					this.squirrel.discard();
				}
				throw failure;
			}
			this.start();
		}

		private void save(boolean complete) {
			this.report.addProperty("complete", complete);
			this.report.addProperty("passed", complete && !this.report.has("error"));
			this.report.addProperty("normalFallObserved", this.falling);
			SquirrelTraceReports.save(this.output, this.report);
		}
	}
}
