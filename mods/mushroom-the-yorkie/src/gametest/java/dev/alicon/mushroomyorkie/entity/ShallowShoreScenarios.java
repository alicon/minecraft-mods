package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.MushroomTheYorkie;
import java.lang.reflect.Field;
import java.util.List;
import net.minecraft.core.BlockPos;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.ai.goal.FollowOwnerGoal;
import net.minecraft.world.entity.ai.goal.GoalSelector;
import net.minecraft.world.entity.ai.goal.WrappedGoal;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.pathfinder.Node;
import net.minecraft.world.level.pathfinder.Path;
import net.minecraft.world.phys.Vec3;

/** Holds the wet half-slab start constant while varying the owner's distance onto the dry bank. */
final class ShallowShoreScenarios {
	private static final int OBSERVATION_TICKS = 120;
	private static final int SETTLED_TICKS = 40;
	private static final long STALLED_SWIMMER_SEED = 0L;

	private ShallowShoreScenarios() {
	}

	static void reachDrySupport(GameTestHelper helper, EntityType<?> boatType, boolean closeOwner) {
		reachDrySupport(helper, boatType, closeOwner, false);
	}

	static void recoverFromStalePath(GameTestHelper helper, EntityType<?> boatType) {
		reachDrySupport(helper, boatType, false, true);
	}

	private static void reachDrySupport(GameTestHelper helper, EntityType<?> boatType, boolean closeOwner, boolean seedStalePath) {
		for (int x = 1; x <= 9; x++) {
			for (int z = 0; z <= 15; z++) {
				helper.setBlock(x, 2, z, Blocks.STONE);
				helper.setBlock(x, 3, z, x < 3 || x > 7 || z == 0 || z >= 8 ? Blocks.STONE
						: z == 7 ? Blocks.STONE_SLAB : Blocks.WATER);
			}
		}
		ServerPlayer owner = SurvivalGameTestPlayers.createWithoutToyCleanup(helper);
		owner.setPos(helper.absoluteVec(new Vec3(5.5D, 4.0D, closeOwner ? 8.8385D : 13.5D)));
		owner.setOnGround(true);
		MushroomYorkieEntity pet = helper.spawn(ModEntities.MUSHROOM_YORKIE, 4, 3, 5);
		Entity boat = helper.spawn(boatType, 5, 3, 4);
		boat.setPos(helper.absoluteVec(new Vec3(5.5D, 3.52D, 4.5D)));
		pet.claimFor(owner);
		pet.startRiding(boat);
		pet.dismountForOwner();
		// The body's edge overlaps the water while the center is over the dry slab.
		pet.setPos(helper.absoluteVec(new Vec3(5.42D, 3.57D, 7.17D)));
		pet.setDeltaMovement(0.0D, -0.16D, 0.0D);
		pet.getRandom().setSeed(STALLED_SWIMMER_SEED);
		new RecoveryObservation(helper, owner, pet, boat, closeOwner, seedStalePath).schedule();
	}

	private static BlockPos underFeet(Entity entity) {
		return BlockPos.containing(entity.getX(), entity.getY() - 0.05D, entity.getZ());
	}

	private static final class RecoveryObservation {
		private final GameTestHelper helper;
		private final ServerPlayer owner;
		private final MushroomYorkieEntity pet;
		private final Entity boat;
		private final boolean closeOwner;
		private final boolean seedStalePath;
		private final long startWorldTick;
		private final int startEntityTick;
		private Vec3 lastPosition;
		private int ticks;
		private int settled;
		private int longestSettled;
		private int firstDryTick;

		private RecoveryObservation(GameTestHelper helper, ServerPlayer owner, MushroomYorkieEntity pet, Entity boat,
				boolean closeOwner, boolean seedStalePath) {
			this.helper = helper;
			this.owner = owner;
			this.pet = pet;
			this.boat = boat;
			this.closeOwner = closeOwner;
			this.seedStalePath = seedStalePath;
			this.startWorldTick = pet.level().getGameTime();
			this.startEntityTick = pet.tickCount;
			this.lastPosition = pet.position();
		}

		private void schedule() {
			this.helper.runAfterDelay(1, this::observe);
		}

		private void observe() {
			try {
				this.ticks++;
				this.helper.assertTrue(this.pet.tickCount == this.startEntityTick + this.ticks
						&& this.pet.level().getGameTime() == this.startWorldTick + this.ticks, "Shallow shore observation skipped a native tick");
				if (this.ticks == 1) {
					double distanceSquared = this.pet.distanceToSqr(this.owner);
					this.helper.assertTrue(this.pet.isInWater() && !this.pet.isUnderWater() && this.owner.onGround()
							&& !this.owner.isInWater() && this.helper.getLevel().getBlockState(underFeet(this.owner)).is(Blocks.STONE)
							&& distanceSquared > 1.0D && (distanceSquared < 4.0D) == this.closeOwner,
							"Shallow shore setup lost the breathing swimmer or dry owner position");
					if (this.seedStalePath) {
						this.seedPathBelowSlab();
					}
				}
				this.helper.assertTrue(this.pet.getHealth() == this.pet.getMaxHealth() && this.pet.getAirSupply() > 0
						&& this.pet.getOwner() == this.owner && !this.boat.isRemoved() && !this.pet.isPassenger()
						&& !this.pet.isNoGravity(), "Shallow shore observation lost a healthy original actor");
				this.helper.assertTrue(this.pet.position().distanceTo(this.lastPosition) < 1.0D, "Shallow shore movement was discontinuous");
				this.lastPosition = this.pet.position();
				BlockPos belowFeet = underFeet(this.pet);
				boolean drySupport = !this.pet.isInWater() && this.pet.onGround()
						&& this.pet.getAirSupply() == this.pet.getMaxAirSupply() && this.pet.distanceToSqr(this.owner) < 16.0D
						&& !this.pet.level().getBlockState(belowFeet).getCollisionShape(this.pet.level(), belowFeet).isEmpty();
				this.settled = drySupport ? this.settled + 1 : 0;
				if (drySupport && this.firstDryTick == 0) this.firstDryTick = this.ticks;
				this.longestSettled = Math.max(this.longestSettled, this.settled);
				if (this.ticks == OBSERVATION_TICKS) {
					String summary = "closeOwner=" + this.closeOwner + ", stalePath=" + this.seedStalePath
							+ ", seed=" + STALLED_SWIMMER_SEED + ", firstDry="
							+ this.firstDryTick + ", longestSettled=" + this.longestSettled + ", position=" + this.pet.position();
					MushroomTheYorkie.LOGGER.info("Shallow shore recovery: {}", summary);
					this.helper.assertTrue(this.longestSettled >= SETTLED_TICKS, "Shallow shore did not settle: " + summary);
					this.cleanup();
					this.helper.succeed();
					return;
				}
				this.schedule();
			} catch (RuntimeException | Error failure) {
				this.cleanup();
				throw failure;
			}
		}

		private void seedPathBelowSlab() {
			var navigation = this.pet.getNavigation();
			BlockPos feet = this.pet.blockPosition();
			this.helper.assertTrue(this.pet.onGround() && this.helper.getLevel().getBlockState(feet).is(Blocks.STONE_SLAB)
					&& navigation.getPath() != null && !navigation.isDone(), "Stale-path test lost the active follow and slab support");
			// Exact bad-path shape from the live trace: one unreachable node in the
			// swimmer's column below the slab. Movement still runs natively.
			Path stale = new Path(List.of(new Node(feet.getX(), feet.getY() - 1, feet.getZ())), this.owner.blockPosition(), false);
			this.helper.assertTrue(navigation.moveTo(stale, 1.25D), "Stale-path setup did not install the recorded partial path");
			this.helper.assertTrue(!activeFollowGoal(this.pet).canContinueToUse(),
					"Active follow should reject the known-bad route before another movement tick");
		}

		private static FollowOwnerGoal activeFollowGoal(MushroomYorkieEntity pet) {
			try {
				Field selector = Mob.class.getDeclaredField("goalSelector");
				selector.setAccessible(true);
				return ((GoalSelector) selector.get(pet)).getAvailableGoals().stream()
						.filter(WrappedGoal::isRunning).map(WrappedGoal::getGoal)
						.filter(FollowOwnerGoal.class::isInstance).map(FollowOwnerGoal.class::cast).findFirst().orElseThrow();
			} catch (ReflectiveOperationException failure) {
				throw new IllegalStateException("Active follow goal inspection is unavailable", failure);
			}
		}

		private void cleanup() {
			this.pet.discard();
			this.boat.discard();
			var players = this.helper.getLevel().getServer().getPlayerList();
			if (players.getPlayer(this.owner.getUUID()) == this.owner) players.remove(this.owner);
			this.owner.discard();
		}
	}
}
