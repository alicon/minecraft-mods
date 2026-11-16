package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.MushroomTheYorkie;
import java.util.function.IntConsumer;
import net.minecraft.core.BlockPos;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.phys.Vec3;

/** Per-world-tick evidence separates ordinary recovery latency from unsafe or discontinuous movement. */
final class BoatBankRecoveryProbe {
	private static final int DEADLINE_TICKS = 400;
	private static final int MIN_OBSERVATION_TICKS = 200;
	private static final int SETTLED_TICKS = 40;
	private final GameTestHelper helper;
	private final MushroomYorkieEntity yorkie;
	private final LivingEntity owner;
	private final boolean boatPresent;
	private final boolean expectFlightHandoff;
	private final long seed;
	private final Runnable cleanup;
	private final IntConsumer observation;
	private long previousWorldTick;
	private int previousEntityTick;
	private Vec3 lastPosition;
	private int ticks;
	private int minimumAir;
	private double largestStep;
	private boolean sawWater;
	private boolean sawEscape;
	private boolean sawFlightHandoff;
	private int firstRecoveryTick = -1;
	private int settledTicks;
	private boolean reenteredWater;

	BoatBankRecoveryProbe(GameTestHelper helper, MushroomYorkieEntity yorkie, LivingEntity owner,
			boolean boatPresent, boolean expectFlightHandoff, long seed, Runnable cleanup) {
		this(helper, yorkie, owner, boatPresent, expectFlightHandoff, seed, cleanup, tick -> {});
	}

	BoatBankRecoveryProbe(GameTestHelper helper, MushroomYorkieEntity yorkie, LivingEntity owner,
			boolean boatPresent, boolean expectFlightHandoff, long seed, Runnable cleanup, IntConsumer observation) {
		this.helper = helper;
		this.yorkie = yorkie;
		this.owner = owner;
		this.boatPresent = boatPresent;
		this.expectFlightHandoff = expectFlightHandoff;
		this.seed = seed;
		this.cleanup = cleanup;
		this.observation = observation;
		this.previousWorldTick = yorkie.level().getGameTime();
		this.previousEntityTick = yorkie.tickCount;
		this.lastPosition = yorkie.position();
		this.minimumAir = yorkie.getAirSupply();
	}

	// Keep one scheduled callback for this fixture: adding independent delayed
	// tasks can postpone native observations. The tick checks reject such gaps.
	void start() {
		this.helper.runAfterDelay(1, this::tick);
	}

	private void tick() {
		this.ticks++;
		this.minimumAir = Math.min(this.minimumAir, this.yorkie.getAirSupply());
		this.largestStep = Math.max(this.largestStep, this.yorkie.position().distanceTo(this.lastPosition));
		this.lastPosition = this.yorkie.position();
		this.sawWater |= this.yorkie.isInWater();
		this.sawEscape |= this.yorkie.waterEscape.active();
		this.sawFlightHandoff |= this.yorkie.waterEscape.active() && this.yorkie.isNoGravity();
		boolean recovered = this.complete();
		if (recovered && this.firstRecoveryTick < 0) this.firstRecoveryTick = this.ticks;
		this.reenteredWater |= this.firstRecoveryTick >= 0 && this.yorkie.isInWater();
		this.settledTicks = recovered ? this.settledTicks + 1 : 0;
		try {
			this.helper.assertTrue(this.yorkie.level().getGameTime() == this.previousWorldTick + 1
					&& this.yorkie.tickCount == this.previousEntityTick + 1, "Recovery observation skipped native ticks: " + this.summary());
			this.previousWorldTick = this.yorkie.level().getGameTime();
			this.previousEntityTick = this.yorkie.tickCount;
			this.observation.accept(this.ticks);
			this.helper.assertTrue(this.yorkie.getHealth() == this.yorkie.getMaxHealth() && this.minimumAir > 0,
					"Recovery lost health or exhausted air: " + this.summary());
			this.helper.assertTrue(this.largestStep < 1.0D, "Recovery moved discontinuously: " + this.summary());
			if (this.ticks >= MIN_OBSERVATION_TICKS && this.settledTicks >= SETTLED_TICKS) {
				this.helper.assertTrue(this.sawWater && (!this.boatPresent || this.sawEscape),
						"Native fixture did not exercise immersion/obstruction escape: " + this.summary());
				this.helper.assertTrue(!this.expectFlightHandoff || this.sawFlightHandoff,
						"Creative fixture did not exercise flight-to-escape handoff: " + this.summary());
				MushroomTheYorkie.LOGGER.info("Native boat-bank recovery: {}", this.summary());
				this.cleanup.run();
				this.helper.succeed();
				return;
			}
			this.helper.assertTrue(this.ticks < DEADLINE_TICKS, "Mushroom did not finish bank recovery: " + this.summary());
		} catch (RuntimeException | Error failure) {
			this.cleanup.run();
			throw failure;
		}
		this.helper.runAfterDelay(1, this::tick);
	}

	private boolean complete() {
		BlockPos underfoot = BlockPos.containing(this.yorkie.getX(), this.yorkie.getY() - 0.05D, this.yorkie.getZ());
		return !this.yorkie.isPassenger() && !this.yorkie.isInWater() && this.yorkie.onGround() && !this.yorkie.isNoGravity()
				&& !this.yorkie.level().getBlockState(underfoot).getCollisionShape(this.yorkie.level(), underfoot).isEmpty()
				&& this.yorkie.getY() >= this.helper.absoluteVec(new Vec3(0, 4, 0)).y
				&& this.yorkie.distanceToSqr(this.owner) < 4.0D && this.yorkie.getAirSupply() == this.yorkie.getMaxAirSupply();
	}

	private String summary() {
		return "seed=" + this.seed + ", ticks=" + this.ticks + ", firstRecovery=" + this.firstRecoveryTick
				+ ", entityTick=" + this.yorkie.tickCount + ", previousEntityTick=" + this.previousEntityTick
				+ ", worldTick=" + this.yorkie.level().getGameTime() + ", previousWorldTick=" + this.previousWorldTick
				+ ", reenteredWater=" + this.reenteredWater + ", settled=" + this.settledTicks
				+ ", boat=" + this.boatPresent + ", minAir=" + this.minimumAir
				+ ", maxStep=" + this.largestStep + ", escape=" + this.sawEscape + ", flightHandoff=" + this.sawFlightHandoff
				+ ", vehicle=" + (this.yorkie.getVehicle() == null ? "none" : this.yorkie.getVehicle().getType())
				+ ", position=" + this.yorkie.position() + ", navigation=" + this.yorkie.getNavigation().getPath()
				+ ", state=" + this.yorkie.waterEscape;
	}
}
