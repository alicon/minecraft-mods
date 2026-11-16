package dev.alicon.mushroomyorkie.entity;

import static dev.alicon.mushroomyorkie.entity.SquirrelTraceReports.point;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import java.nio.file.Path;
import java.util.function.UnaryOperator;
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

	static void openCanopy(GameTestHelper helper) {
		new Probe(helper, false, false, true, 1).start();
	}

	static void closeBelowAscent(GameTestHelper helper) {
		new Probe(helper, false, false, true, 2).start();
	}

	static void savedAttack(GameTestHelper helper, UnaryOperator<SquirrelEntity> roundTrip, boolean south) {
		new Probe(helper, true, south, false, 0, roundTrip).start();
	}

	private static final class Probe {
		private final GameTestHelper helper;
		private SquirrelEntity squirrel;
		private final UnaryOperator<SquirrelEntity> roundTrip;
		private final ServerPlayer attacker;
		private final boolean perched, south, closeFace;
		private final int terrainVariant;
		private final JsonObject report = new JsonObject();
		private final JsonArray frames = new JsonArray();
		private final Path output;
		private final Vec3 origin;
		private int ticks, stableTicks, interruptedAt = -1, recoveredAt = -1;
		private float postAttackHealth;
		private Vec3 attackPosition;
		private double largestAttackDisplacement;
		private boolean normalFallObserved;
		private float previousHealth, fallHealthLoss, minimumHealth = Float.MAX_VALUE;

		Probe(GameTestHelper helper, boolean perched, boolean south, boolean closeFace) {
			this(helper, perched, south, closeFace, 0);
		}

		Probe(GameTestHelper helper, boolean perched, boolean south, boolean closeFace, int terrainVariant) {
			this(helper, perched, south, closeFace, terrainVariant, null);
		}

		Probe(GameTestHelper helper, boolean perched, boolean south, boolean closeFace, int terrainVariant, UnaryOperator<SquirrelEntity> roundTrip) {
			this.helper = helper;
			this.roundTrip = roundTrip;
			this.perched = perched;
			this.south = south;
			this.closeFace = closeFace;
			this.terrainVariant = terrainVariant;
			int offset = closeFace ? 0 : 4;
			this.origin = helper.absoluteVec(new Vec3(offset, 0, offset));
			int floorMax = closeFace ? 7 : 15;
			if (!closeFace) {
				var corner = helper.absoluteVec(new Vec3(15.9D, 1, 15.9D));
				var bounds = helper.getBounds();
				helper.assertTrue(corner.x < bounds.maxX && corner.z < bounds.maxZ, "Attack fixture requires the declared 16-block arena");
			}
			for (int x = 0; x <= floorMax; x++) {
				for (int z = 0; z <= floorMax; z++) helper.setBlock(x, 0, z, Blocks.STONE);
			}
			for (int y = 1; y <= 5; y++) helper.setBlock(4 + offset, y, 4 + offset, Blocks.OAK_LOG);
			if (terrainVariant == 1) helper.setBlock(3, 4, 4, Blocks.STONE);
			this.squirrel = helper.spawn(ModEntities.SQUIRREL, 1 + offset, 1, 4 + offset);
			GameTestSeeds.apply(this.squirrel, "interruption-" + perched + "-" + south + "-" + closeFace);
			this.attacker = closeFace ? null : SurvivalGameTestPlayers.createWithoutToyCleanup(helper);
			if (this.attacker != null) {
				// This stationary player is only the attack source. The squirrel is never pinned.
				this.attacker.setPos(this.origin.add(3.0D, perched ? 3.0D : 1.0D, south ? 6.0D : 3.0D));
			}
			String directory = System.getenv("MUSHROOM_SQUIRREL_TRACE_DIR");
			this.output = directory == null ? null : Path.of(directory, "native-interruption-" + perched + "-" + south
					+ "-" + closeFace + "-variant" + terrainVariant + "-" + this.squirrel.getUUID() + ".json");
			this.report.addProperty("entityUuid", this.squirrel.getUUID().toString());
			this.report.addProperty("perched", perched);
			this.report.addProperty("nativeLoadImmediatelyAfterHit", roundTrip != null);
			this.report.addProperty("southAttack", south);
			this.report.addProperty("closeFace", closeFace);
			this.report.addProperty("terrainVariant", terrainVariant);
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
				this.minimumHealth = Math.min(this.minimumHealth, this.squirrel.getHealth());
				this.frames.add(this.frame());
				this.helper.assertTrue(this.squirrel.isAlive(), "Interrupted squirrel died");
				if (this.interruptedAt < 0) {
					this.helper.assertTrue(this.squirrel.getHealth() == this.squirrel.getMaxHealth(), "Interruption setup lost health");
					boolean ready = this.perched ? this.squirrel.hasFoundTree() && this.squirrel.isNoGravity()
							: this.terrainVariant == 2 ? this.squirrel.getY() >= this.origin.y + 3.5D && this.squirrel.getY() < this.origin.y + 4.0D
							: this.squirrel.getY() >= this.origin.y + 1.8D && this.squirrel.getY() < this.origin.y + 2.3D;
					this.stableTicks = ready ? this.stableTicks + 1 : 0;
					if (this.stableTicks >= (this.perched ? 40 : 1)) this.interrupt();
				} else {
					if (this.attacker != null) {
						this.largestAttackDisplacement = Math.max(this.largestAttackDisplacement, Math.hypot(
								this.squirrel.getX() - this.attackPosition.x, this.squirrel.getZ() - this.attackPosition.z));
						if (this.ticks - this.interruptedAt >= 10) this.helper.assertTrue(this.largestAttackDisplacement > 0.1D,
								"Native attack impulse was cancelled before physical displacement");
					}
					this.normalFallObserved |= !this.squirrel.isNoGravity() && this.squirrel.getDeltaMovement().y < -0.2D;
					if (this.perched && !this.closeFace) {
						this.helper.assertTrue(this.squirrel.getHealth() <= this.previousHealth, "Attack recovery gained health");
						if (this.squirrel.getHealth() < this.previousHealth) {
							var damage = this.squirrel.getLastDamageSource();
							this.helper.assertTrue(this.normalFallObserved && this.squirrel.onGround() && damage != null && damage.getMsgId().equals("fall"),
									"Attack recovery took damage other than an observed native landing");
							this.fallHealthLoss += this.previousHealth - this.squirrel.getHealth();
						}
						this.previousHealth = this.squirrel.getHealth();
					} else this.helper.assertTrue(this.squirrel.getHealth() == (this.closeFace ? this.squirrel.getMaxHealth() : this.postAttackHealth),
							"Interruption recovery took additional damage");
					boolean recovered = this.squirrel.hasFoundTree() && this.squirrel.isNoGravity()
							&& this.squirrel.getY() >= this.origin.y + (this.terrainVariant == 1 ? 2.8D : 4.8D);
					if (this.terrainVariant > 0) this.helper.assertTrue(this.squirrel.onClimbable(), "An unchanged remaining route released its ascent");
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
				var block = this.helper.absolutePos(new net.minecraft.core.BlockPos(3, this.terrainVariant == 1 ? 4 : this.terrainVariant == 2 ? 1 : 3, 4));
				this.helper.assertTrue(!new net.minecraft.world.phys.AABB(block).intersects(this.squirrel.getBoundingBox()),
						"Changed face overlaps the squirrel: invalid setup");
				this.helper.assertTrue(this.squirrel.getX() < this.origin.x + 4.0D
						&& Math.abs(this.squirrel.getZ() - this.origin.z - 4.5D) < 0.2D, "Squirrel did not use the west face");
				if (!this.perched) this.helper.assertTrue(!this.squirrel.hasFoundTree() && !this.squirrel.isNoGravity(), "Ascent intervention missed its phase");
				this.helper.getLevel().setBlockAndUpdate(block, (this.terrainVariant == 1 ? Blocks.AIR : Blocks.STONE).defaultBlockState());
			} else {
				this.helper.assertTrue(this.attacker.hasLineOfSight(this.squirrel)
						&& this.attacker.getEyePosition().distanceToSqr(this.squirrel.getBoundingBox().getCenter()) <= 9.0D, "Native attack lacks reach/line of sight");
				this.helper.assertTrue(this.attacker.getMainHandItem().isEmpty(), "Native attack fixture is not empty-handed");
				this.helper.assertTrue(this.attacker.getAttackStrengthScale(0) >= 0.99F, "Native attack is not charged");
				Vec3 direction = this.squirrel.position().subtract(this.attacker.position());
				this.attacker.setYRot((float) Math.toDegrees(Math.atan2(-direction.x, direction.z)));
				this.attacker.setSprinting(true);
				float before = this.squirrel.getHealth();
				this.attackPosition = this.squirrel.position();
				this.report.addProperty("attackStrength", this.attacker.getAttackStrengthScale(0));
				this.report.addProperty("attackerNativeTick", this.attacker.tickCount);
				this.attacker.attack(this.squirrel);
				this.postAttackHealth = this.squirrel.getHealth();
				this.previousHealth = this.postAttackHealth;
				this.helper.assertTrue(Math.hypot(this.squirrel.getDeltaMovement().x, this.squirrel.getDeltaMovement().z) > 0.1D,
						"Native sprint attack did not supply a horizontal impulse");
				this.helper.assertTrue(this.postAttackHealth < before, "Native attack caused no damage");
				this.report.addProperty("attackHealthLoss", before - this.postAttackHealth);
				this.report.add("attackerPosition", point(this.attacker.position().subtract(this.origin)));
			}
			this.report.add("afterInterruption", this.frame());
			if (this.roundTrip != null) {
				var uuid = this.squirrel.getUUID();
				this.squirrel = this.roundTrip.apply(this.squirrel);
				this.helper.assertTrue(uuid.equals(this.squirrel.getUUID()) && this.squirrel.getHealth() == this.postAttackHealth
						&& this.squirrel.isNoGravity() && this.squirrel.hurtTime > 0, "Native saved hit lost its damage/perch state");
				this.helper.assertTrue(Math.hypot(this.squirrel.getDeltaMovement().x, this.squirrel.getDeltaMovement().z) > 0.1D, "Native saved hit lost its impulse");
				this.report.add("afterNativeLoad", this.frame());
			}
		}

		private JsonObject frame() {
			JsonObject frame = new JsonObject();
			frame.addProperty("tick", this.ticks);
			frame.addProperty("nativeTick", this.squirrel.tickCount);
			frame.addProperty("health", this.squirrel.getHealth());
			frame.addProperty("fallDistance", this.squirrel.fallDistance);
			frame.addProperty("hurtTime", this.squirrel.hurtTime);
			var damage = this.squirrel.getLastDamageSource();
			frame.addProperty("lastDamageType", damage == null ? "unavailable" : damage.getMsgId());
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
			this.report.addProperty("largestAttackDisplacement", this.largestAttackDisplacement);
			this.report.addProperty("normalFallObserved", this.normalFallObserved);
			this.report.addProperty("fallHealthLoss", this.fallHealthLoss);
			this.report.addProperty("minimumHealth", this.minimumHealth);
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
