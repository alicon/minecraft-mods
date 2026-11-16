package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.MushroomTheYorkie;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.Vec3;

/** Controlled NoAI/position-pinned inputs test controller boundaries, not free-swimming physics. */
final class WaterEscapeControllerScenarios {
	private WaterEscapeControllerScenarios() {
	}

	static void breathingIdleDoesNotEscape(GameTestHelper helper) {
		run(helper, null);
	}

	static void episodeReleasesDespiteOscillatingPositions(GameTestHelper helper, EntityType<?> boatType) {
		run(helper, boatType);
	}

	private static void run(GameTestHelper helper, EntityType<?> boatType) {
		BoatBankEscapeScenarios.buildPool(helper);
		boolean breathing = boatType == null;
		if (breathing) helper.setBlock(3, 5, 3, Blocks.OAK_PLANKS);
		var owner = SurvivalGameTestPlayers.createWithoutToyCleanup(helper);
		owner.setPos(helper.absoluteVec(new Vec3(9, 4, 3.5)));
		MushroomYorkieEntity yorkie = helper.spawn(ModEntities.MUSHROOM_YORKIE, 3, 3, 3);
		yorkie.claimFor(owner);
		yorkie.setNoAi(true);
		yorkie.setNoGravity(true);
		Entity boat = breathing ? null : helper.spawn(boatType, 6, 3, 3);
		if (boat != null) {
			boat.setPos(helper.absoluteVec(new Vec3(6.3125D, 3.52D, 3.5D)));
			yorkie.startRiding(boat);
			yorkie.dismountForOwner();
		}
		Runnable cleanup = () -> {
			yorkie.discard();
			if (boat != null) boat.discard();
			if (helper.getLevel().getServer().getPlayerList().getPlayer(owner.getUUID()) == owner) {
				helper.getLevel().getServer().getPlayerList().remove(owner);
			}
			owner.discard();
		};
		new PinnedProbe(helper, yorkie, breathing, cleanup).start();
	}

	private static final class PinnedProbe {
		private final GameTestHelper helper;
		private final MushroomYorkieEntity yorkie;
		private final boolean breathing;
		private final Runnable cleanup;
		private int ticks;
		private int began = -1;
		private int released = -1;

		private PinnedProbe(GameTestHelper helper, MushroomYorkieEntity yorkie, boolean breathing, Runnable cleanup) {
			this.helper = helper;
			this.yorkie = yorkie;
			this.breathing = breathing;
			this.cleanup = cleanup;
			this.pin();
		}

		private void start() {
			this.helper.runAfterDelay(1, this::tick);
		}

		private void pin() {
			double x = this.breathing ? 3.5D : this.began >= 0 && this.ticks % 2 == 0 ? 6.19D : 6.49D;
			this.yorkie.setPos(this.helper.absoluteVec(new Vec3(x, this.breathing ? 3.8D : 2.6D, 3.5D)));
			this.yorkie.setDeltaMovement(Vec3.ZERO);
		}

		private void tick() {
			this.ticks++;
			this.pin();
			// Native eye-fluid state lags initial placement; establish it before
			// invoking the controller, then require it throughout the observation.
			if (this.ticks <= 2) {
				this.start();
				return;
			}
			try {
				this.helper.assertTrue(this.yorkie.isInWater() && this.yorkie.isUnderWater() != this.breathing,
						"Pinned input wet=" + this.yorkie.isInWater() + ", eyes=" + this.yorkie.isUnderWater()
								+ ", passenger=" + this.yorkie.isPassenger() + ", position=" + this.yorkie.position());
				// NoAI prevents a second invocation; the native entity still supplies
				// wet flags and tickCount. Position pinning is explicit test input.
				this.yorkie.waterEscape.tick();
				boolean active = this.yorkie.waterEscape.active();
				if (this.breathing) {
					this.helper.assertTrue(!active, "Breathing idle pet started escape after the stall gate");
					if (this.ticks >= 45) {
						this.finish();
						return;
					}
				} else {
					if (active && this.began < 0) this.began = this.yorkie.tickCount;
					this.helper.assertTrue(this.began >= 0 || this.ticks < 60, "Pinned obstruction never started an escape");
					if (this.began >= 0 && !active && this.released < 0) {
						this.released = this.yorkie.tickCount;
						this.helper.assertTrue(this.released - this.began >= 79 && this.released - this.began <= 80,
								"Oscillating input did not exercise the absolute 80-tick control bound");
					}
					this.helper.assertTrue(this.began < 0 || this.yorkie.tickCount - this.began <= 80 || !active,
							"Oscillating movement kept escape active beyond its episode bound");
					if (this.released >= 0) {
						this.helper.assertTrue(!active, "Escape resumed inside its cooldown");
						if (this.yorkie.tickCount - this.released >= 39) {
							this.finish();
							return;
						}
					}
				}
				this.helper.assertTrue(this.ticks < 180, "Pinned controller probe exceeded its bounded observation");
			} catch (RuntimeException | Error failure) {
				this.cleanup.run();
				throw failure;
			}
			this.start();
		}

		private void finish() {
			MushroomTheYorkie.LOGGER.info("Controlled pinned water input: breathing={}, ticks={}, began={}, released={}",
					this.breathing, this.ticks, this.began, this.released);
			this.cleanup.run();
			this.helper.succeed();
		}
	}
}
