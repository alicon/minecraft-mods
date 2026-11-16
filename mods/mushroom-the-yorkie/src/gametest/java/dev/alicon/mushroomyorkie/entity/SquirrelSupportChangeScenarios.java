package dev.alicon.mushroomyorkie.entity;

import static dev.alicon.mushroomyorkie.entity.SquirrelTraceReports.point;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import java.nio.file.Path;
import java.util.function.UnaryOperator;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.Vec3;

/** Identical support edits must behave alike before and after genuine native save/load. */
final class SquirrelSupportChangeScenarios {
	private SquirrelSupportChangeScenarios() {
	}

	static void observe(GameTestHelper helper, UnaryOperator<SquirrelEntity> roundTrip, boolean reload, boolean removeMiddle) {
		for (int x = 0; x <= 7; x++) {
			for (int z = 0; z <= 7; z++) helper.setBlock(x, 0, z, Blocks.STONE);
		}
		for (int y = 1; y <= 5; y++) helper.setBlock(4, y, 4, Blocks.OAK_LOG);
		SquirrelEntity squirrel = helper.spawn(ModEntities.SQUIRREL, 1, 1, 4);
		GameTestSeeds.apply(squirrel, "support-" + reload + "-" + removeMiddle);
		new Probe(helper, squirrel, roundTrip, reload, removeMiddle).start();
	}

	private static final class Probe {
		private final GameTestHelper helper;
		private SquirrelEntity squirrel;
		private final UnaryOperator<SquirrelEntity> roundTrip;
		private final boolean reload, removeMiddle;
		private final JsonObject report = new JsonObject();
		private final JsonArray frames = new JsonArray();
		private final Path output;
		private int ticks, stable, changedAt = -1;
		private boolean reloaded, falling;
		private Vec3 perch;

		Probe(GameTestHelper helper, SquirrelEntity squirrel, UnaryOperator<SquirrelEntity> roundTrip, boolean reload, boolean removeMiddle) {
			this.helper = helper; this.squirrel = squirrel; this.roundTrip = roundTrip;
			this.reload = reload; this.removeMiddle = removeMiddle;
			String directory = System.getenv("MUSHROOM_SQUIRREL_TRACE_DIR");
			this.output = directory == null ? null : Path.of(directory, "native-support-change-" + reload + "-" + removeMiddle + "-" + squirrel.getUUID() + ".json");
			this.report.addProperty("reload", reload); this.report.addProperty("removeMiddle", removeMiddle);
			this.report.addProperty("entityUuid", squirrel.getUUID().toString()); this.report.add("frames", this.frames);
		}

		void start() {
			this.helper.runAfterDelay(1, this::tick);
		}

		private void tick() {
			this.ticks++;
			try {
				JsonObject frame = new JsonObject();
				frame.addProperty("tick", this.ticks); frame.addProperty("health", this.squirrel.getHealth());
				frame.addProperty("foundTree", this.squirrel.hasFoundTree()); frame.addProperty("noGravity", this.squirrel.isNoGravity());
				frame.addProperty("onGround", this.squirrel.onGround());
				frame.add("position", point(this.squirrel.position().subtract(this.helper.absoluteVec(Vec3.ZERO))));
				frame.add("velocity", point(this.squirrel.getDeltaMovement())); this.frames.add(frame);
				this.helper.assertTrue(this.squirrel.isAlive() && this.squirrel.getHealth() == this.squirrel.getMaxHealth(), "Support fixture lost health");
				boolean clinging = this.squirrel.hasFoundTree() && this.squirrel.isNoGravity()
						&& this.squirrel.getY() >= this.helper.absoluteVec(Vec3.ZERO).y + 4.8D;
				if (this.changedAt < 0) {
					this.stable = clinging ? this.stable + 1 : 0;
					if (this.stable >= 40) {
						if (this.reload && !this.reloaded) {
							this.perch = this.squirrel.position();
							var uuid = this.squirrel.getUUID(); this.squirrel = this.roundTrip.apply(this.squirrel);
							this.helper.assertTrue(uuid.equals(this.squirrel.getUUID()), "Support control load changed identity");
							this.reloaded = true; this.stable = 0;
						} else {
							this.perch = this.squirrel.position();
							this.helper.setBlock(4, this.removeMiddle ? 3 : 1, 4, Blocks.AIR);
							this.changedAt = this.ticks; this.stable = 0;
						}
					}
				} else if (this.removeMiddle) {
					this.falling |= !this.squirrel.isNoGravity() && this.squirrel.getDeltaMovement().y < -0.2D;
					if (this.ticks - this.changedAt >= 5) this.helper.assertTrue(!this.squirrel.isNoGravity() && !this.squirrel.hasFoundTree(),
							"Missing supporting column retained a perch");
					if (this.falling && this.squirrel.getY() < this.perch.y - 0.2D) { this.finish(); return; }
				} else {
					this.helper.assertTrue(clinging && Math.abs(this.squirrel.getY() - this.perch.y) <= 0.2D
							&& Math.hypot(this.squirrel.getX() - this.perch.x, this.squirrel.getZ() - this.perch.z) <= 0.2D,
							"Remote ground log removal released an intact supporting perch");
					if (++this.stable >= 40) { this.finish(); return; }
				}
				this.helper.assertTrue(this.ticks < 300, "Support change did not produce its bounded native reaction");
				if (this.ticks % 10 == 0) this.save(false);
			} catch (RuntimeException | Error failure) {
				this.report.addProperty("error", failure.toString());
				try { this.save(true); } catch (RuntimeException saveFailure) { failure.addSuppressed(saveFailure); }
				finally { this.squirrel.discard(); }
				throw failure;
			}
			this.start();
		}

		private void finish() {
			this.save(true); this.squirrel.discard(); this.helper.succeed();
		}

		private void save(boolean complete) {
			this.report.addProperty("complete", complete); this.report.addProperty("passed", complete && !this.report.has("error"));
			this.report.addProperty("changedAt", this.changedAt); this.report.addProperty("normalFallObserved", this.falling);
			SquirrelTraceReports.save(this.output, this.report);
		}
	}
}
