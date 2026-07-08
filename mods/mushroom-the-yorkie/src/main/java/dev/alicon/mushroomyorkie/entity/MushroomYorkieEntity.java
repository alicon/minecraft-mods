package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.pet.PetNeeds;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.AgeableMob;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.entity.EntityTypeTest;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;

/** Tameable Yorkie companion entity that adapts Minecraft events to Mushroom's pet state. */
public final class MushroomYorkieEntity extends net.minecraft.world.entity.TamableAnimal {
	private static final float TINY_DOG_PITCH = 1.35F;
	static final int NEEDS_INTERVAL_TICKS = 200;
	static final int BARK_INTERVAL_TICKS = 100;
	static final double PEACEFUL_MOB_SEARCH_RADIUS = 10.0D;
	static final double HOSTILE_MOB_SEARCH_RADIUS = 12.0D;
	static final double UNTAMED_PLAYER_STICK_RADIUS = 18.0D;
	static final double UNTAMED_PLAYER_RETURN_RADIUS = 8.0D;
	static final double UNTAMED_PLAYER_TOO_CLOSE_RADIUS = 3.0D;

	/** Synced/rendered flight-trick sentinel; keep ids stable across Minecraft target source sets. */
	public static final int FLIGHT_TRICK_NONE = 0;
	/** Synced/rendered barrel-roll id used by MushroomFlightController and client render state. */
	public static final int FLIGHT_TRICK_BARREL_ROLL = 1;
	/** Synced/rendered loop id used by MushroomFlightController and client render state. */
	public static final int FLIGHT_TRICK_LOOP = 2;
	/** Flight trick duration consumed by movement and animation interpolation. */
	public static final int FLIGHT_TRICK_DURATION_TICKS = 36;

	private static final EntityDataAccessor<Integer> DATA_FLIGHT_TRICK_TYPE = SynchedEntityData.defineId(MushroomYorkieEntity.class, EntityDataSerializers.INT);
	private static final EntityDataAccessor<Integer> DATA_FLIGHT_TRICK_TICKS = SynchedEntityData.defineId(MushroomYorkieEntity.class, EntityDataSerializers.INT);
	private static final EntityDataAccessor<Boolean> DATA_SLEEPING = SynchedEntityData.defineId(MushroomYorkieEntity.class, EntityDataSerializers.BOOLEAN);
	private static final EntityDataAccessor<Boolean> DATA_HARNESS = SynchedEntityData.defineId(MushroomYorkieEntity.class, EntityDataSerializers.BOOLEAN);
	static final double CREATIVE_FLIGHT_FOLLOW_DISTANCE_SQ = 6.25D;
	static final double CREATIVE_FLIGHT_SPEED = 0.22D;

	PetNeeds needs = new PetNeeds();
	final MushroomDomesticState domestic = new MushroomDomesticState();
	final MushroomReliefState relief = new MushroomReliefState();
	final MushroomPeacefulMobMemory peacefulMobMemory = new MushroomPeacefulMobMemory();
	final MushroomTrustState trust = new MushroomTrustState();
	final MushroomOwnerPresenceState ownerPresence = new MushroomOwnerPresenceState();
	final MushroomCreativeFlightRecovery creativeRecoveryFlight = new MushroomCreativeFlightRecovery();
	private final MushroomSleepInteractionTracker sleepInteractions = new MushroomSleepInteractionTracker();
	int nightWakeTicks;
	int scaredRunTicks;
	int darkPanicTicks;

	/**
	 * Creates a Mushroom Yorkie entity instance.
	 *
	 * @param entityType registered Yorkie entity type
	 * @param level world the entity belongs to
	 */
	public MushroomYorkieEntity(EntityType<? extends MushroomYorkieEntity> entityType, Level level) {
		super(entityType, level);
	}

	@Override
	protected void defineSynchedData(SynchedEntityData.Builder builder) {
		super.defineSynchedData(builder);
		builder.define(DATA_FLIGHT_TRICK_TYPE, FLIGHT_TRICK_NONE);
		builder.define(DATA_FLIGHT_TRICK_TICKS, 0);
		builder.define(DATA_SLEEPING, false);
		builder.define(DATA_HARNESS, false);
	}

	public static AttributeSupplier.Builder createAttributes() {
		return MushroomYorkieAttributes.create();
	}

	@Override
	protected void registerGoals() {
		MushroomYorkieGoals.register(this);
	}

	void addYorkieGoal(int priority, Goal goal) {
		this.goalSelector.addGoal(priority, goal);
	}

	@Override
	public boolean isFood(ItemStack stack) {
		return MushroomFoodPolicy.isYorkieTreat(stack);
	}

	@Override
	public InteractionResult mobInteract(Player player, InteractionHand hand) {
		InteractionResult handled = MushroomYorkieInteractions.handle(this, player, hand);
		return handled != null ? handled : super.mobInteract(player, hand);
	}

	void useInteractionItem(Player player, InteractionHand hand, ItemStack stack) {
		this.usePlayerItem(player, hand, stack);
	}

	/** Claims trust and vanilla taming together; use this path so one-owner checks and AI state stay aligned. */
	public void claimFor(Player player) {
		this.trust.claim(player);
		this.scaredRunTicks = 0;
		this.tame(player);
		this.setOwner(player);
		this.setMushroomOrderedToSit(false);
		this.setSleeping(false);
	}

	boolean handleSleepingInteract(Player player) {
		return this.sleepInteractions.handle(this, player);
	}

	@Override
	protected void customServerAiStep(ServerLevel level) {
		super.customServerAiStep(level);
		MushroomYorkieServerAi.tick(this, level);
	}

	@Override
	protected boolean canFlyToOwner() {
		return MushroomYorkieStateQueries.ownerIsCreative(this);
	}

	boolean isMushroomSleeping() {
		return this.entityData.get(DATA_SLEEPING);
	}

	void setSleeping(boolean sleeping) {
		MushroomSittingPose.setSleeping(this, sleeping);
	}

	void setSleepingData(boolean sleeping) {
		this.entityData.set(DATA_SLEEPING, sleeping);
	}

	/** Public render/query hook for the custom sleep pose; vanilla sitting may also be true while sleeping. */
	public boolean isCurledUpSleeping() {
		return this.isMushroomSleeping();
	}

	/** Harness gate for leash behavior; interactions should mutate harness through MushroomYorkieInteractions. */
	public boolean hasHarness() {
		return this.entityData.get(DATA_HARNESS);
	}

	void setHarness(boolean harness) {
		this.entityData.set(DATA_HARNESS, harness);
	}

	void setMushroomOrderedToSit(boolean sitting) {
		MushroomSittingPose.setOrderedToSit(this, sitting);
	}

	/** Loaded-world owner lookup for the one-Mushroom-per-player rule; unloaded chunks are intentionally ignored. */
	public static boolean hasLoadedMushroomOwnedBy(ServerLevel level, Player player) {
		return !level.getEntities(
				EntityTypeTest.forClass(MushroomYorkieEntity.class),
				yorkie -> yorkie.belongsTo(player)
		).isEmpty();
	}

	/** Ownership predicate shared by trust logic and config-gated duplicate-claim checks. */
	public boolean belongsTo(Player player) {
		return this.trust.belongsTo(this, player);
	}

	void mutePeacefulMobBarking(ServerLevel level) {
		this.ownerPresence.mutePeacefulMobBarking(level, this);
	}

	boolean peacefulMobBarkingMuted(ServerLevel level) {
		return this.ownerPresence.peacefulMobBarkingMuted(level);
	}

	void hurtFromNeglect(ServerLevel level, float amount) {
		this.hurtServer(level, level.damageSources().starve(), amount);
	}

	void recordOwnerContact(ServerLevel level) {
		this.ownerPresence.recordOwnerContact(level);
	}

	/** Last server game time when Mushroom was near or recovered by its owner. */
	public long lastOwnerContactGameTime() {
		return this.ownerPresence.lastOwnerContactGameTime();
	}

	/** Clears stuck/passenger state after lost-owner recovery and records fresh owner contact. */
	public void recoverWithOwner(ServerLevel level) {
		this.ownerPresence.recoverWithOwner(this, level);
	}

	@Override
	public boolean canBeLeashed() {
		return this.hasHarness() && super.canBeLeashed();
	}

	void setFlightTrick(int type, int ticks) {
		this.entityData.set(DATA_FLIGHT_TRICK_TYPE, type);
		this.entityData.set(DATA_FLIGHT_TRICK_TICKS, ticks);
	}

	void setFlightTrickTicks(int ticks) {
		this.entityData.set(DATA_FLIGHT_TRICK_TICKS, ticks);
	}

	/** Renderer-visible flight trick id; values are stable constants shared with client animation code. */
	public int getFlightTrickType() {
		return this.entityData.get(DATA_FLIGHT_TRICK_TYPE);
	}

	/** Remaining renderer-visible trick ticks for interpolation against FLIGHT_TRICK_DURATION_TICKS. */
	public int getFlightTrickTicks() {
		return this.entityData.get(DATA_FLIGHT_TRICK_TICKS);
	}

	@Override
	protected void addAdditionalSaveData(ValueOutput output) {
		super.addAdditionalSaveData(output);
		MushroomYorkiePersistence.save(this, output);
	}

	@Override
	protected void readAdditionalSaveData(ValueInput input) {
		super.readAdditionalSaveData(input);
		MushroomYorkiePersistence.read(this, input);
	}

	@Override
	public boolean hurtServer(ServerLevel level, DamageSource damageSource, float amount) {
		boolean hurt = super.hurtServer(level, damageSource, amount);
		if (hurt && damageSource.getEntity() instanceof Player player && this.belongsTo(player)) {
			MushroomScoldingHandler.recordTrustedPlayerHit(this, level, player);
		}

		return hurt;
	}

	@Override
	protected net.minecraft.sounds.SoundEvent getAmbientSound() {
		return null;
	}

	@Override
	protected net.minecraft.sounds.SoundEvent getHurtSound(DamageSource damageSource) {
		return MushroomYorkieSounds.hurtSound(damageSource);
	}

	@Override
	protected net.minecraft.sounds.SoundEvent getDeathSound() {
		return MushroomYorkieSounds.deathSound();
	}

	@Override
	public float getVoicePitch() {
		return TINY_DOG_PITCH;
	}

	@Override
	public AgeableMob getBreedOffspring(ServerLevel level, AgeableMob partner) {
		return null;
	}
}
