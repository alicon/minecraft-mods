package dev.alicon.copsrobbers.entity;

import dev.alicon.copsrobbers.capture.PoliceCaptureHandler;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;
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
	float forwardInput;
	int crashCooldownTicks;
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
		PoliceCruiserPersistence.write(this, output);
	}

	@Override
	protected void readAdditionalSaveData(ValueInput input) {
		super.readAdditionalSaveData(input);
		PoliceCruiserPersistence.read(this, input);
	}

	@Override
	public void tick() {
		super.tick();
		if (!this.level().isClientSide()) {
			PoliceCruiserServerTick.tick(this);
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

	void setCapturedRobbers(int count) {
		this.entityData.set(CAPTURED_ROBBERS, PoliceCruiserControlPolicy.clampCapturedRobbers(count));
	}

	void startTrick(int trickType) {
		if (this.trickTicks() <= 0) {
			this.entityData.set(TRICK_TYPE, trickType);
			this.entityData.set(TRICK_TICKS, TRICK_DURATION_TICKS);
		}
	}

	void setTrickType(int trickType) {
		this.entityData.set(TRICK_TYPE, trickType);
	}

	void setTrickTicks(int ticks) {
		this.entityData.set(TRICK_TICKS, ticks);
	}

	@Override
	public void travel(Vec3 travelVector) {
		if (PoliceCruiserTravelController.travelWithDriver(this, travelVector)) {
			return;
		}

		super.travel(travelVector);
	}

	void travelGround(Player driver, Vec3 travelVector) {
		float strafe = PoliceCruiserControlPolicy.strafeInput(driver.xxa);
		float forward = PoliceCruiserControlPolicy.forwardInput(driver.zza);
		this.forwardInput = forward;

		this.setSpeed((float) this.getAttributeValue(Attributes.MOVEMENT_SPEED));
		super.travel(new Vec3(strafe, travelVector.y, forward));
	}

	void hurtVehicleFromCrash(ServerLevel level) {
		super.hurtServer(level, this.damageSources().flyIntoWall(), PoliceCruiserGameplayConfig.CRASH_TRUCK_DAMAGE);
	}

	Vec3 forwardVector() {
		Vec3 forward = this.calculateViewVector(0.0F, this.getYRot());
		return new Vec3(forward.x, 0.0D, forward.z).normalize();
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
