package dev.alicon.mushroomyorkie.entity;

import static dev.alicon.mushroomyorkie.entity.SquirrelTraceReports.point;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import java.nio.file.Path;
import java.util.function.UnaryOperator;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.Vec3;

/** Native entity save/load must not make the ground-contact gate leave a saved perch hovering forever. */
final class SquirrelReloadApproachScenarios {
	private SquirrelReloadApproachScenarios() {
	}

	static void savedPerch(GameTestHelper helper, UnaryOperator<SquirrelEntity> roundTrip) {
		fixture(helper, roundTrip, false);
	}

	static void removedSavedPerch(GameTestHelper helper, UnaryOperator<SquirrelEntity> roundTrip) {
		fixture(helper, roundTrip, true);
	}

	static void changedLowerFace(GameTestHelper helper, UnaryOperator<SquirrelEntity> roundTrip) {
		fixture(helper, roundTrip, false, true);
	}

	private static void fixture(GameTestHelper helper, UnaryOperator<SquirrelEntity> roundTrip, boolean removeTree) {
		fixture(helper, roundTrip, removeTree, false);
	}

	private static void fixture(GameTestHelper helper, UnaryOperator<SquirrelEntity> roundTrip, boolean removeTree, boolean blockBelow) {
		for (int x = 0; x <= 7; x++) {
			for (int z = 0; z <= 7; z++) helper.setBlock(x, 0, z, Blocks.STONE);
		}
		for (int y = 1; y <= 5; y++) helper.setBlock(4, y, 4, Blocks.OAK_LOG);
		SquirrelEntity squirrel = helper.spawn(ModEntities.SQUIRREL, 1, 1, 4);
		GameTestSeeds.apply(squirrel, "saved-squirrel-perch");
		new Probe(helper, squirrel, roundTrip, removeTree, blockBelow).start();
	}

	private static final class Probe {
		private final GameTestHelper helper;
		private SquirrelEntity squirrel;
		private final UnaryOperator<SquirrelEntity> roundTrip;
		private final JsonObject report = new JsonObject();
		private final JsonArray frames = new JsonArray();
		private final Path output;
		private final boolean removeTree, blockBelow;
		private boolean normalFallObserved;
		private double savedPerchY, minimumReloadY;
		private int ticks, stableTicks, reloadedAt = -1;

		Probe(GameTestHelper helper, SquirrelEntity squirrel, UnaryOperator<SquirrelEntity> roundTrip, boolean removeTree, boolean blockBelow) {
			this.helper = helper;
			this.squirrel = squirrel;
			this.roundTrip = roundTrip;
			this.removeTree = removeTree;
			this.blockBelow = blockBelow;
			String directory = System.getenv("MUSHROOM_SQUIRREL_TRACE_DIR");
			this.output = directory == null ? null : Path.of(directory, "native-perch-reload-" + removeTree + "-lower-" + blockBelow + "-" + squirrel.getUUID() + ".json");
			this.report.addProperty("entityUuid", squirrel.getUUID().toString());
			this.report.addProperty("changedLowerFace", blockBelow);
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
				frame.addProperty("foundTree", this.squirrel.hasFoundTree());
				frame.addProperty("noGravity", this.squirrel.isNoGravity());
				frame.addProperty("onGround", this.squirrel.onGround());
				frame.add("position", point(this.squirrel.position().subtract(this.helper.absoluteVec(Vec3.ZERO))));
				this.frames.add(frame);
				this.helper.assertTrue(this.squirrel.isAlive(), "Squirrel died during native saved-perch recovery");
				if (!this.removeTree || this.reloadedAt < 0) {
					this.helper.assertTrue(this.squirrel.getHealth() == this.squirrel.getMaxHealth(), "Intact saved perch lost health");
				}
				if (this.reloadedAt >= 0) {
					this.minimumReloadY = Math.min(this.minimumReloadY, this.squirrel.getY());
					if (!this.removeTree) this.helper.assertTrue(this.squirrel.getY() >= this.savedPerchY - 0.2D,
							"Intact saved perch dropped before resuming");
				}
				boolean clinging = this.squirrel.hasFoundTree() && this.squirrel.isNoGravity()
						&& this.squirrel.getY() >= this.helper.absoluteVec(Vec3.ZERO).y + 4.8D;
				if (this.reloadedAt >= 0 && this.ticks - this.reloadedAt >= 10) {
					this.helper.assertTrue(!this.squirrel.isNoGravity() || clinging,
							"Saved no-gravity flag remained unowned behind the ground-contact gate");
				}
				boolean removedAndLanded = this.removeTree && this.reloadedAt >= 0 && this.squirrel.onGround()
						&& this.squirrel.getY() <= this.helper.absoluteVec(Vec3.ZERO).y + 1.1D;
				if (this.reloadedAt >= 0 && !this.squirrel.isNoGravity() && this.squirrel.getDeltaMovement().y < -0.2D) {
					this.normalFallObserved = true;
				}
				this.stableTicks = clinging || removedAndLanded ? this.stableTicks + 1 : 0;
				if (this.stableTicks >= (removedAndLanded ? 10 : 40)) {
					if (this.reloadedAt < 0) {
						this.savedPerchY = this.squirrel.getY();
						if (this.removeTree) {
							for (int y = 1; y <= 5; y++) this.helper.setBlock(4, y, 4, Blocks.AIR);
						}
						if (this.blockBelow) {
							var block = this.helper.absolutePos(new net.minecraft.core.BlockPos(3, 3, 4));
							this.helper.assertTrue(!new net.minecraft.world.phys.AABB(block).intersects(this.squirrel.getBoundingBox()),
									"Lower-face reload fixture overlaps the original squirrel");
							this.helper.setBlock(3, 3, 4, Blocks.STONE);
						}
						var originalId = this.squirrel.getUUID();
						this.squirrel = this.roundTrip.apply(this.squirrel);
						this.helper.assertTrue(originalId.equals(this.squirrel.getUUID()), "Native squirrel load changed identity");
						this.reloadedAt = this.ticks;
						this.minimumReloadY = this.squirrel.getY();
						this.stableTicks = 0;
					} else {
						if (this.removeTree) this.helper.assertTrue(this.normalFallObserved && !this.squirrel.isNoGravity(),
								"Removed saved tree did not restore ordinary falling");
						if (this.removeTree) this.helper.assertTrue(this.squirrel.getHealth() < this.squirrel.getMaxHealth(),
								"Removed saved tree suppressed native fall damage");
						this.save(true);
						this.squirrel.discard();
						this.helper.succeed();
						return;
					}
				}
				if (this.ticks % 10 == 0) this.save(false);
				this.helper.assertTrue(this.ticks < 300, "Squirrel did not resume a stable perch after native save/load");
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
			this.report.addProperty("reloadedAt", this.reloadedAt);
			this.report.addProperty("removedTree", this.removeTree);
			this.report.addProperty("normalFallObserved", this.normalFallObserved);
			if (this.reloadedAt >= 0) {
				this.report.addProperty("savedPerchY", this.savedPerchY);
				this.report.addProperty("minimumReloadY", this.minimumReloadY);
			}
			SquirrelTraceReports.save(this.output, this.report);
		}
	}
}
