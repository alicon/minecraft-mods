package dev.alicon.copsrobbers.entity;

import dev.alicon.copsrobbers.capture.PoliceCaptureHandler;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.MoverType;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/** Server-authoritative rideable cruiser; client payload handlers enter through the static driver methods below. */
public class PoliceCruiserEntity extends Mob {
	/** Synced/rendered trick sentinel; keep numeric values stable for packet/render compatibility. */
	public static final int TRICK_NONE = 0;
	/** Synced/rendered barrel-roll trick id; only creative driver controls should trigger it. */
	public static final int TRICK_BARREL_ROLL = 1;
	/** Synced/rendered loop trick id; only creative driver controls should trigger it. */
	public static final int TRICK_LOOP = 2;
	/** Gameplay-tuned trick duration shared with render interpolation. */
	public static final int TRICK_DURATION_TICKS = PoliceCruiserGameplayConfig.TRICK_DURATION_TICKS;
	private static final String LIGHTS_ENABLED_TAG = "lights_enabled";
	private static final String SIREN_ENABLED_TAG = "siren_enabled";
	private static final String CAPTURED_ROBBERS_TAG = "captured_robbers";
	private static final EntityDataAccessor<Boolean> LIGHTS_ENABLED =
			SynchedEntityData.defineId(PoliceCruiserEntity.class, EntityDataSerializers.BOOLEAN);
	private static final EntityDataAccessor<Boolean> SIREN_ENABLED =
			SynchedEntityData.defineId(PoliceCruiserEntity.class, EntityDataSerializers.BOOLEAN);
	private static final EntityDataAccessor<Integer> TRICK_TYPE =
			SynchedEntityData.defineId(PoliceCruiserEntity.class, EntityDataSerializers.INT);
	private static final EntityDataAccessor<Integer> TRICK_TICKS =
			SynchedEntityData.defineId(PoliceCruiserEntity.class, EntityDataSerializers.INT);
	private static final EntityDataAccessor<Integer> CAPTURED_ROBBERS =
			SynchedEntityData.defineId(PoliceCruiserEntity.class, EntityDataSerializers.INT);
	private float forwardInput;
	private int crashCooldownTicks;
	boolean creativeFlightEnabled;
	float creativeFlightLiftInput;

	/** Keeps placed cruisers persistent so structure kits and captured-robber state survive normal despawn rules. */
	public PoliceCruiserEntity(EntityType<? extends PoliceCruiserEntity> entityType, Level level) {
		super(entityType, level);
		this.setPersistenceRequired();
	}

	/** Uses gameplay-tuned movement values; change cruiser feel in PoliceCruiserGameplayConfig, not inline here. */
	public static AttributeSupplier.Builder createAttributes() {
		return Mob.createMobAttributes()
				.add(Attributes.MAX_HEALTH, 42.0D)
				.add(Attributes.MOVEMENT_SPEED, PoliceCruiserGameplayConfig.RIDDEN_SPEED)
				.add(Attributes.KNOCKBACK_RESISTANCE, 0.85D)
				.add(Attributes.STEP_HEIGHT, 1.0D)
				.add(Attributes.SAFE_FALL_DISTANCE, 6.0D);
	}

	@Override
	protected void registerGoals() {
	}

	@Override
	protected void defineSynchedData(SynchedEntityData.Builder builder) {
		super.defineSynchedData(builder);
		builder.define(LIGHTS_ENABLED, true);
		builder.define(SIREN_ENABLED, false);
		builder.define(TRICK_TYPE, TRICK_NONE);
		builder.define(TRICK_TICKS, 0);
		builder.define(CAPTURED_ROBBERS, 0);
	}

	@Override
	protected void addAdditionalSaveData(ValueOutput output) {
		super.addAdditionalSaveData(output);
		output.putBoolean(LIGHTS_ENABLED_TAG, this.lightsEnabled());
		output.putBoolean(SIREN_ENABLED_TAG, this.sirenEnabled());
		output.putInt(CAPTURED_ROBBERS_TAG, this.capturedRobbers());
	}

	@Override
	protected void readAdditionalSaveData(ValueInput input) {
		super.readAdditionalSaveData(input);
		this.setLightsEnabled(input.getBooleanOr(LIGHTS_ENABLED_TAG, true));
		this.setSirenEnabled(input.getBooleanOr(SIREN_ENABLED_TAG, false));
		this.setCapturedRobbers(input.getIntOr(CAPTURED_ROBBERS_TAG, 0));
	}

	@Override
	public void tick() {
		super.tick();
		if (!this.level().isClientSide()) {
			if (!(this.getControllingPassenger() instanceof Player driver) || !driver.isCreative()) {
				this.creativeFlightEnabled = false;
				this.creativeFlightLiftInput = 0.0F;
				this.setNoGravity(false);
			}
			if (!(this.getControllingPassenger() instanceof Player)) {
				this.forwardInput = 0.0F;
			}
			if (this.crashCooldownTicks > 0) {
				this.crashCooldownTicks--;
			}
			this.tickCreativeFlightLift();
			this.playDrivenEngineSound();
			this.tickTrick();
			this.handleFrontImpact();
			this.tickJobHandlers();
			if (this.sirenEnabled() && this.isVehicle() && this.tickCount % 8 == 0) {
				this.playSirenPulse();
			}
		}
	}

	@Override
	protected InteractionResult mobInteract(Player player, InteractionHand hand) {
		if (player.isSecondaryUseActive()) {
			return InteractionResult.PASS;
		}

		if (!this.level().isClientSide()) {
			player.startRiding(this);
		}
		return InteractionResult.SUCCESS;
	}

	protected void tickJobHandlers() {
		PoliceCaptureHandler.captureRobbersNear(this);
		PoliceCaptureHandler.releaseAtNearbyJail(this);
	}

	/** Synced visual state read by renderers and toggled through the server-side driver payload handler. */
	public boolean lightsEnabled() {
		return this.entityData.get(LIGHTS_ENABLED);
	}

	/** Synced audio/visual state; the server owns toggling so clients cannot desync sirens. */
	public boolean sirenEnabled() {
		return this.entityData.get(SIREN_ENABLED);
	}

	/** Current creative-only trick id used by client render interpolation. */
	public int trickType() {
		return this.entityData.get(TRICK_TYPE);
	}

	/** Remaining trick ticks; renderers combine this with the stable trick duration constant. */
	public int trickTicks() {
		return this.entityData.get(TRICK_TICKS);
	}

	/** Captured-robber cargo count, clamped by PoliceCruiserControlPolicy before it reaches synced data. */
	public int capturedRobbers() {
		return this.entityData.get(CAPTURED_ROBBERS);
	}

	/** Capture handler entrypoint; policy owns capacity so future storage changes stay testable. */
	public void addCapturedRobber() {
		this.setCapturedRobbers(PoliceCruiserControlPolicy.afterCapture(this.capturedRobbers()));
	}

	/** Jail drop-off entrypoint; delegates bounds and partial-release rules to the pure policy class. */
	public void removeCapturedRobbers(int count) {
		this.setCapturedRobbers(PoliceCruiserControlPolicy.afterRelease(this.capturedRobbers(), count));
	}

	/** C2S lights payload boundary; ignores requests unless the sender is the controlling passenger. */
	public static void toggleLightsForDriver(ServerPlayer player) {
		PoliceCruiserDriverControls.toggleLights(player);
	}

	/** C2S siren payload boundary; keeps siren state server-owned and tied to the active driver. */
	public static void toggleSirenForDriver(ServerPlayer player) {
		PoliceCruiserDriverControls.toggleSiren(player);
	}

	/** Creative-only flight toggle used for playtesting and stunt controls; survival drivers are ignored. */
	public static void toggleFlightForDriver(ServerPlayer player) {
		PoliceCruiserDriverControls.toggleFlight(player);
	}

	/** C2S flight input boundary; sanitize here before per-tick movement consumes the lift value. */
	public static void updateFlightInputForDriver(ServerPlayer player, float lift) {
		PoliceCruiserDriverControls.updateFlightInput(player, lift);
	}

	/** Creative-only stunt payload boundary for the renderer-visible barrel-roll state. */
	public static void triggerBarrelRollForDriver(ServerPlayer player) {
		PoliceCruiserDriverControls.triggerBarrelRoll(player);
	}

	/** Creative-only stunt payload boundary for the renderer-visible loop state. */
	public static void triggerLoopForDriver(ServerPlayer player) {
		PoliceCruiserDriverControls.triggerLoop(player);
	}

	void setLightsEnabled(boolean enabled) {
		this.entityData.set(LIGHTS_ENABLED, enabled);
	}

	void setSirenEnabled(boolean enabled) {
		this.entityData.set(SIREN_ENABLED, enabled);
	}

	private void setCapturedRobbers(int count) {
		this.entityData.set(CAPTURED_ROBBERS, PoliceCruiserControlPolicy.clampCapturedRobbers(count));
	}

	void startTrick(int trickType) {
		if (this.trickTicks() <= 0) {
			this.entityData.set(TRICK_TYPE, trickType);
			this.entityData.set(TRICK_TICKS, TRICK_DURATION_TICKS);
		}
	}

	private void tickTrick() {
		int ticks = this.trickTicks();
		if (ticks <= 0) {
			this.entityData.set(TRICK_TYPE, TRICK_NONE);
			return;
		}

		this.applyTrickMovement(ticks);
		this.entityData.set(TRICK_TICKS, ticks - 1);
		if (ticks - 1 <= 0) {
			this.entityData.set(TRICK_TYPE, TRICK_NONE);
		}
	}

	private void applyTrickMovement(int ticksRemaining) {
		if (!(this.getControllingPassenger() instanceof Player driver) || !driver.isCreative()) {
			return;
		}

		double progress = (TRICK_DURATION_TICKS - ticksRemaining) / (double) TRICK_DURATION_TICKS;
		double lift = Math.sin(progress * Math.PI) * 0.12D;
		Vec3 forward = this.forwardVector();
		if (this.trickType() == TRICK_LOOP) {
			lift += Math.sin(progress * Math.PI * 2.0D) * 0.2D;
			driver.setXRot((float) Math.sin(progress * Math.PI * 2.0D) * 65.0F);
		} else if (this.trickType() == TRICK_BARREL_ROLL) {
			driver.setYRot(driver.getYRot() + 18.0F);
			driver.setXRot((float) Math.sin(progress * Math.PI * 2.0D) * 28.0F);
			this.setYRot(this.getYRot() + 18.0F);
			this.yRotO = this.getYRot();
		}

		this.setNoGravity(true);
		this.setDeltaMovement(this.getDeltaMovement().add(forward.scale(0.08D)).add(0.0D, lift, 0.0D));
	}

	@Override
	public void travel(Vec3 travelVector) {
		if (this.isAlive() && this.isVehicle() && this.getControllingPassenger() instanceof Player driver) {
			this.setYRot(driver.getYRot());
			this.yRotO = this.getYRot();
			this.setXRot(0.0F);
			this.setYHeadRot(this.getYRot());
			this.yBodyRot = this.getYRot();

			if (driver.isCreative()) {
				if (this.creativeFlightEnabled) {
					this.setNoGravity(true);
					this.forwardInput = driver.zza;
				} else {
					this.setNoGravity(false);
					this.travelGround(driver, travelVector);
				}
				return;
			}

			this.setNoGravity(false);
			this.travelGround(driver, travelVector);
			return;
		}

		super.travel(travelVector);
	}

	private void travelGround(Player driver, Vec3 travelVector) {
		float strafe = PoliceCruiserControlPolicy.strafeInput(driver.xxa);
		float forward = PoliceCruiserControlPolicy.forwardInput(driver.zza);
		this.forwardInput = forward;

		this.setSpeed((float) this.getAttributeValue(Attributes.MOVEMENT_SPEED));
		super.travel(new Vec3(strafe, travelVector.y, forward));
	}

	private void tickCreativeFlightLift() {
		if (!this.creativeFlightEnabled || !(this.getControllingPassenger() instanceof Player driver) || !driver.isCreative()) {
			return;
		}
		this.setNoGravity(true);
		float forwardInput = PoliceCruiserControlPolicy.forwardInput(driver.zza);
		float strafeInput = PoliceCruiserControlPolicy.strafeInput(driver.xxa);
		this.forwardInput = forwardInput;

		Vec3 look = driver.getLookAngle();
		Vec3 horizontalForward = this.forwardVector();
		Vec3 right = this.calculateViewVector(0.0F, driver.getYRot() - 90.0F).normalize();
		Vec3 forward = forwardInput > 0.0F ? look : horizontalForward;
		Vec3 desired = forward.scale(forwardInput).add(right.scale(strafeInput)).add(0.0D, this.creativeFlightLiftInput * 0.75D, 0.0D);
		if (desired.lengthSqr() > 1.0E-4D) {
			desired = desired.normalize().scale(PoliceCruiserGameplayConfig.CREATIVE_FLIGHT_SPEED);
		}

		Vec3 motion = this.getDeltaMovement().scale(0.62D).add(desired);
		if (desired.lengthSqr() <= 1.0E-4D) {
			motion = motion.scale(0.65D);
		}
		this.setDeltaMovement(motion);
		this.move(MoverType.SELF, this.getDeltaMovement());
	}

	private void handleFrontImpact() {
		if (!this.isVehicle()) {
			return;
		}

		double horizontalSpeed = this.getDeltaMovement().multiply(1.0D, 0.0D, 1.0D).length();
		if (horizontalSpeed < PoliceCruiserGameplayConfig.IMPACT_MIN_SPEED && Math.abs(this.forwardInput) <= 0.05F) {
			return;
		}

		AABB entityCrashBox = this.entityCrashImpactBox();
		AABB blockCrashBox = this.blockCrashImpactBox();
		if (!this.level().noBlockCollision(this, blockCrashBox)) {
			Vec3 movement = this.getDeltaMovement();
			this.setDeltaMovement(movement.x * -0.18D, Math.min(movement.y, 0.0D) * 0.2D, movement.z * -0.18D);
			if (this.level() instanceof ServerLevel level) {
				level.playSound(null, this.blockPosition(), SoundEvents.COPPER_BULB_BREAK, SoundSource.PLAYERS, 0.7F, 0.75F);
				this.damageCrashOccupants(level);
			}
		}

		if (!(this.level() instanceof ServerLevel level)) {
			return;
		}

		boolean hitMob = false;
		for (Entity entity : this.level().getEntities(this, entityCrashBox, this::canDamageOnImpact)) {
			if (entity instanceof LivingEntity target) {
				if (target instanceof BankRobberEntity robber && PoliceCaptureHandler.captureRobber(this, robber)) {
					hitMob = true;
					continue;
				}
				if (target.invulnerableTime > 0) {
					continue;
				}
				target.hurtServer(level, this.damageSources().generic(), PoliceCruiserGameplayConfig.IMPACT_DAMAGE);
				target.push(this.impactForwardVector().scale(0.95D).add(0.0D, 0.25D, 0.0D));
				hitMob = true;
			}
		}
		if (hitMob) {
			level.playSound(null, this.blockPosition(), SoundEvents.MACE_SMASH_GROUND, SoundSource.PLAYERS, 0.65F, 1.15F);
			this.damageCrashOccupants(level);
		}
	}

	private boolean canDamageOnImpact(Entity entity) {
		return entity instanceof LivingEntity
				&& entity != this.getControllingPassenger()
				&& !entity.isPassengerOfSameVehicle(this)
				&& entity.isAlive();
	}

	private AABB frontImpactBox() {
		Vec3 center = this.position().add(this.impactForwardVector().scale(2.2D)).add(0.0D, 0.8D, 0.0D);
		return AABB.ofSize(center, 3.6D, 1.9D, 2.3D);
	}

	private AABB entityCrashImpactBox() {
		AABB impact = this.getBoundingBox().inflate(1.35D, 0.45D, 1.35D).minmax(this.frontImpactBox());
		Vec3 movement = this.getDeltaMovement();
		if (movement.lengthSqr() > 1.0E-4D) {
			impact = impact.minmax(impact.move(movement.reverse().scale(2.0D)))
					.expandTowards(movement.normalize().scale(1.6D));
		}
		return impact;
	}

	private AABB blockCrashImpactBox() {
		return this.frontImpactBox();
	}

	private void damageCrashOccupants(ServerLevel level) {
		if (this.crashCooldownTicks > 0) {
			return;
		}

		this.crashCooldownTicks = 12;
		super.hurtServer(level, this.damageSources().flyIntoWall(), PoliceCruiserGameplayConfig.CRASH_TRUCK_DAMAGE);
		if (this.getControllingPassenger() instanceof Player driver && !driver.isCreative()) {
			driver.hurtServer(level, this.damageSources().flyIntoWall(), PoliceCruiserGameplayConfig.CRASH_SELF_DAMAGE);
		}
	}

	private void playDrivenEngineSound() {
		if (!this.isVehicle() || this.tickCount % 9 != 0) {
			return;
		}

		float pitch = 0.75F + Math.min((float) this.getDeltaMovement().length() * 0.65F, 0.45F);
		this.level().playSound(null, this.getX(), this.getY() + 0.45D, this.getZ(), SoundEvents.MINECART_RIDING, SoundSource.PLAYERS, 0.32F, pitch);
	}

	private void playSirenPulse() {
		float pitch = this.tickCount % 32 < 16 ? 0.82F : 1.48F;
		this.level().playSound(null, this.getX(), this.getY() + 1.0D, this.getZ(), SoundEvents.NOTE_BLOCK_BIT.value(), SoundSource.PLAYERS, 1.05F, pitch);
		this.level().playSound(null, this.getX(), this.getY() + 1.0D, this.getZ(), SoundEvents.NOTE_BLOCK_XYLOPHONE.value(), SoundSource.PLAYERS, 0.38F, pitch * 0.74F);
	}

	private Vec3 forwardVector() {
		Vec3 forward = this.calculateViewVector(0.0F, this.getYRot());
		return new Vec3(forward.x, 0.0D, forward.z).normalize();
	}

	private Vec3 impactForwardVector() {
		Vec3 movement = this.getDeltaMovement().multiply(1.0D, 0.0D, 1.0D);
		if (movement.lengthSqr() > 0.0001D) {
			return movement.normalize();
		}
		if (this.getControllingPassenger() instanceof Player driver) {
			Vec3 look = driver.getLookAngle().multiply(1.0D, 0.0D, 1.0D);
			if (look.lengthSqr() > 0.0001D) {
				return look.normalize();
			}
		}
		return this.forwardVector();
	}

	@Override
	public LivingEntity getControllingPassenger() {
		Entity passenger = this.getFirstPassenger();
		return passenger instanceof LivingEntity livingEntity ? livingEntity : null;
	}

	@Override
	protected boolean canAddPassenger(Entity passenger) {
		return this.getPassengers().isEmpty();
	}

	@Override
	public boolean isPushable() {
		return true;
	}

	@Override
	public boolean removeWhenFarAway(double distanceToClosestPlayer) {
		return false;
	}

	@Override
	public boolean hurtServer(ServerLevel level, DamageSource damageSource, float amount) {
		boolean hurt = super.hurtServer(level, damageSource, amount);
		if (hurt && this.isDeadOrDying()) {
			this.ejectPassengers();
		}
		return hurt;
	}
}
