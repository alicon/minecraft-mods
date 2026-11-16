package dev.alicon.mushroomyorkie.entity;

import static dev.alicon.mushroomyorkie.entity.SquirrelTraceReports.point;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import java.nio.file.Path;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.Vec3;

/** Native attacks and changed climbing terrain retain full squirrel AI and physical damage. */
final class SquirrelInterruptionScenarios {
	private SquirrelInterruptionScenarios() {
	}

	static void attack(GameTestHelper helper, boolean perched, boolean south) {
		new Probe(helper, perched, south, false).start();
	}

	static void closeClimbingFace(GameTestHelper helper) {
		new Probe(helper, false, false, true).start();
	}

	static void closeBelowPerch(GameTestHelper helper) {
		new Probe(helper, true, false, true).start();
	}

	private static final class Probe {
		private final GameTestHelper helper;
		private final SquirrelEntity squirrel;
		private final ServerPlayer attacker;
		private final boolean perched, south, closeFace;
		private final JsonObject report = new JsonObject();
		private final JsonArray frames = new JsonArray();
		private final Path output;
		private final Vec3 origin;
		private int ticks, stableTicks, interruptedAt = -1, recoveredAt = -1;
		private float postAttackHealth;

		Probe(GameTestHelper helper, boolean perched, boolean south, boolean closeFace) {
			this.helper = helper;
			this.perched = perched;
			this.south = south;
			this.closeFace = closeFace;
			this.origin = helper.absoluteVec(Vec3.ZERO);
			for (int x = 0; x <= 7; x++) {
				for (int z = 0; z <= 7; z++) helper.setBlock(x, 0, z, Blocks.STONE);
			}
			for (int y = 1; y <= 5; y++) helper.setBlock(4, y, 4, Blocks.OAK_LOG);
			this.squirrel = helper.spawn(ModEntities.SQUIRREL, 1, 1, 4);
			GameTestSeeds.apply(this.squirrel, "interruption-" + perched + "-" + south + "-" + closeFace);
			this.attacker = closeFace ? null : SurvivalGameTestPlayers.createWithoutToyCleanup(helper);
			if (this.attacker != null) {
				// This stationary player is only the attack source. The squirrel is never pinned.
				this.attacker.setPos(helper.absoluteVec(new Vec3(3.0D, perched ? 3.0D : 1.0D, south ? 6.0D : 3.0D)));
			}
			String directory = System.getenv("MUSHROOM_SQUIRREL_TRACE_DIR");
			this.output = directory == null ? null : Path.of(directory, "native-interruption-" + perched + "-" + south
					+ "-" + closeFace + "-" + this.squirrel.getUUID() + ".json");
			this.report.addProperty("entityUuid", this.squirrel.getUUID().toString());
			this.report.addProperty("perched", perched);
			this.report.addProperty("southAttack", south);
			this.report.addProperty("closeFace", closeFace);
			this.report.add("frames", this.frames);
		}

		void start() {
			this.helper.runAfterDelay(1, this::tick);
		}

		private void tick() {
			this.ticks++;
			try {
				// The embedded test connection has no client movement packets to drive doTick.
				// Advance the synthetic attack source through native player logic once per world tick.
				if (this.attacker != null) this.attacker.doTick();
				this.frames.add(this.frame());
				this.helper.assertTrue(this.squirrel.isAlive(), "Interrupted squirrel died");
				if (this.interruptedAt < 0) {
					this.helper.assertTrue(this.squirrel.getHealth() == this.squirrel.getMaxHealth(), "Interruption setup lost health");
					boolean ready = this.perched ? this.squirrel.hasFoundTree() && this.squirrel.isNoGravity()
							: this.squirrel.getY() >= this.origin.y + 1.8D && this.squirrel.getY() < this.origin.y + 2.3D;
					this.stableTicks = ready ? this.stableTicks + 1 : 0;
					if (this.stableTicks >= (this.perched ? 40 : 1)) this.interrupt();
				} else {
					this.helper.assertTrue(this.squirrel.getHealth() == (this.closeFace ? this.squirrel.getMaxHealth() : this.postAttackHealth),
							"Interruption recovery took additional damage");
					boolean recovered = this.squirrel.hasFoundTree() && this.squirrel.isNoGravity()
							&& this.squirrel.getY() >= this.origin.y + 4.8D;
					if (this.perched && this.closeFace) this.helper.assertTrue(recovered, "Changing terrain below an intact perch caused a fall");
					this.stableTicks = recovered ? this.stableTicks + 1 : 0;
					if (recovered && this.recoveredAt < 0) this.recoveredAt = this.ticks;
					if (this.stableTicks >= 40) {
						this.helper.assertTrue(Math.hypot(this.squirrel.getX() - this.origin.x - 4.5D,
								this.squirrel.getZ() - this.origin.z - 4.5D) < 1.5D, "Squirrel recovered on an unrelated tree");
						this.save(true);
						this.cleanup();
						this.helper.succeed();
						return;
					}
				}
				if (this.ticks % 10 == 0) this.save(false);
				this.helper.assertTrue(this.ticks < 300, "Squirrel failed interruption recovery: at=" + this.interruptedAt
						+ ", position=" + this.squirrel.position() + ", noGravity=" + this.squirrel.isNoGravity());
			} catch (RuntimeException | Error failure) {
				this.report.addProperty("error", failure.toString());
				try {
					this.save(true);
				} catch (RuntimeException saveFailure) {
					failure.addSuppressed(saveFailure);
				} finally {
					this.cleanup();
				}
				throw failure;
			}
			this.start();
		}

		private void interrupt() {
			this.interruptedAt = this.ticks;
			this.stableTicks = 0;
			this.report.add("beforeInterruption", this.frame());
			if (this.closeFace) {
				var block = this.helper.absolutePos(new net.minecraft.core.BlockPos(3, 3, 4));
				this.helper.assertTrue(!new net.minecraft.world.phys.AABB(block).intersects(this.squirrel.getBoundingBox()),
						"Changed face overlaps the squirrel: invalid setup");
				this.helper.assertTrue(this.squirrel.getX() < this.origin.x + 4.0D, "Squirrel did not use the west face");
				this.helper.setBlock(3, 3, 4, Blocks.STONE);
			} else {
				this.helper.assertTrue(this.attacker.hasLineOfSight(this.squirrel)
						&& this.attacker.getEyePosition().distanceToSqr(this.squirrel.getBoundingBox().getCenter()) <= 9.0D, "Native attack lacks reach/line of sight");
				this.helper.assertTrue(this.attacker.getMainHandItem().isEmpty(), "Native attack fixture is not empty-handed");
				this.helper.assertTrue(this.attacker.getAttackStrengthScale(0) >= 0.99F, "Native attack is not charged");
				Vec3 direction = this.squirrel.position().subtract(this.attacker.position());
				this.attacker.setYRot((float) Math.toDegrees(Math.atan2(-direction.x, direction.z)));
				this.attacker.setSprinting(true);
				float before = this.squirrel.getHealth();
				this.report.addProperty("attackStrength", this.attacker.getAttackStrengthScale(0));
				this.report.addProperty("attackerNativeTick", this.attacker.tickCount);
				this.attacker.attack(this.squirrel);
				this.postAttackHealth = this.squirrel.getHealth();
				this.helper.assertTrue(this.postAttackHealth < before, "Native attack caused no damage");
				this.report.addProperty("attackHealthLoss", before - this.postAttackHealth);
				this.report.add("attackerPosition", point(this.attacker.position().subtract(this.origin)));
			}
			this.report.add("afterInterruption", this.frame());
		}

		private JsonObject frame() {
			JsonObject frame = new JsonObject();
			frame.addProperty("tick", this.ticks);
			frame.addProperty("nativeTick", this.squirrel.tickCount);
			frame.addProperty("health", this.squirrel.getHealth());
			frame.addProperty("foundTree", this.squirrel.hasFoundTree());
			frame.addProperty("noGravity", this.squirrel.isNoGravity());
			frame.addProperty("onClimbable", this.squirrel.onClimbable());
			frame.addProperty("onGround", this.squirrel.onGround());
			frame.add("position", point(this.squirrel.position().subtract(this.origin)));
			frame.add("velocity", point(this.squirrel.getDeltaMovement()));
			return frame;
		}

		private void save(boolean complete) {
			this.report.addProperty("complete", complete);
			this.report.addProperty("passed", complete && !this.report.has("error"));
			this.report.addProperty("interruptedAt", this.interruptedAt);
			this.report.addProperty("recoveredAt", this.recoveredAt);
			SquirrelTraceReports.save(this.output, this.report);
		}

		private void cleanup() {
			this.squirrel.discard();
			if (this.attacker != null) {
				this.helper.getLevel().getServer().getPlayerList().remove(this.attacker);
				this.attacker.discard();
			}
		}
	}
}
