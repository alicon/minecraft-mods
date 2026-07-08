package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.pet.PetNeeds;
import java.util.UUID;
import net.minecraft.core.BlockPos;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.tags.FluidTags;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.AgeableMob;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.ai.goal.FloatGoal;
import net.minecraft.world.entity.ai.goal.FollowOwnerGoal;
import net.minecraft.world.entity.ai.goal.LookAtPlayerGoal;
import net.minecraft.world.entity.ai.goal.RandomLookAroundGoal;
import net.minecraft.world.entity.ai.goal.RandomStrollGoal;
import net.minecraft.world.entity.ai.goal.SitWhenOrderedToGoal;
import net.minecraft.world.entity.animal.Animal;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.entity.EntityTypeTest;
import net.minecraft.world.phys.Vec3;

/** Tameable Yorkie companion entity that adapts Minecraft events to Mushroom's pet state. */
public final class MushroomYorkieEntity extends net.minecraft.world.entity.TamableAnimal {
	private static final float TINY_DOG_PITCH = 1.35F;
	private static final int NIGHT_START = 13_000;
	private static final int NIGHT_END = 23_000;
	static final int NEEDS_INTERVAL_TICKS = 200;
	static final int BARK_INTERVAL_TICKS = 100;
	private static final int NIGHT_WAKE_TICKS = 20 * 20;
	private static final int DOUBLE_CLICK_TICKS = 8;
	static final double PEACEFUL_MOB_SEARCH_RADIUS = 10.0D;
	static final double HOSTILE_MOB_SEARCH_RADIUS = 12.0D;
	static final double UNTAMED_PLAYER_STICK_RADIUS = 18.0D;
	static final double UNTAMED_PLAYER_RETURN_RADIUS = 8.0D;
	static final double UNTAMED_PLAYER_TOO_CLOSE_RADIUS = 3.0D;
	private static final int SCARED_RUN_TICKS = 20 * 12;

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
	private static final String HUNGER_KEY = "Hunger", POTTY_KEY = "Potty", MOOD_KEY = "Mood", ENERGY_KEY = "Energy";
	private static final String NIGHT_WAKE_TICKS_KEY = "NightWakeTicks", HARNESS_KEY = "Harness";
	private static final String PEACEFUL_MOB_BARK_MUTED_UNTIL_KEY = "PeacefulMobBarkMutedUntil";
	private static final String LAST_FOOD_BOWL_DAY_KEY = "LastFoodBowlDay", LAST_WATER_BOWL_DAY_KEY = "LastWaterBowlDay";
	private static final String LAST_OWNER_CONTACT_GAME_TIME_KEY = "LastOwnerContactGameTime";
	private static final String LAST_RELIEF_DAY_KEY = "LastReliefDay", CALMED_PEACEFUL_MOBS_KEY = "CalmedPeacefulMobs";
	private static final int PEACEFUL_MOB_BARK_MUTED_TICKS = 6_000;
	static final double CREATIVE_FLIGHT_FOLLOW_DISTANCE_SQ = 6.25D;
	static final double CREATIVE_FLIGHT_SPEED = 0.22D;

	PetNeeds needs = new PetNeeds();
	final MushroomDomesticState domestic = new MushroomDomesticState();
	final MushroomReliefState relief = new MushroomReliefState();
	final MushroomPeacefulMobMemory peacefulMobMemory = new MushroomPeacefulMobMemory();
	private final MushroomTrustState trust = new MushroomTrustState();
	int nightWakeTicks;
	private int lastInteractTick = -DOUBLE_CLICK_TICKS;
	private UUID lastInteractPlayer;
	long peacefulMobBarkMutedUntil = -1L;
	int scaredRunTicks;
	int darkPanicTicks;
	private long lastOwnerContactGameTime;

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
		return Animal.createMobAttributes()
				.add(Attributes.MAX_HEALTH, 12.0D)
				.add(Attributes.MOVEMENT_SPEED, 0.34D)
				.add(Attributes.FOLLOW_RANGE, 24.0D)
				.add(Attributes.ATTACK_DAMAGE, 1.0D)
				.add(Attributes.STEP_HEIGHT, 1.0D);
	}

	@Override
	protected void registerGoals() {
		this.goalSelector.addGoal(0, new FloatGoal(this));
		this.goalSelector.addGoal(1, new SleepAtNightGoal(this));
		this.goalSelector.addGoal(2, new NightStirGoal(this));
		this.goalSelector.addGoal(3, new IndoorPottyWarningGoal(this));
		this.goalSelector.addGoal(4, new DomesticCareGoal(this));
		this.goalSelector.addGoal(5, new FetchBallGoal(this));
		this.goalSelector.addGoal(6, new StructureScentGoal(this));
		this.goalSelector.addGoal(7, new BarkAtPeacefulMobsGoal(this));
		this.goalSelector.addGoal(8, new HesitantHostileMobGoal(this));
		this.goalSelector.addGoal(9, new UntamedStayNearPlayerGoal(this));
		this.goalSelector.addGoal(10, new SitWhenOrderedToGoal(this));
		this.goalSelector.addGoal(11, new FollowOwnerGoal(this, 1.25D, 2.0F, 1.0F));
		this.goalSelector.addGoal(12, new CreativeProfileGoal(this));
		this.goalSelector.addGoal(13, new DaytimeBumShuffleGoal(this));
		this.goalSelector.addGoal(14, new RandomStrollGoal(this, 0.9D, 80));
		this.goalSelector.addGoal(15, new LookAtPlayerGoal(this, Player.class, 8.0F));
		this.goalSelector.addGoal(16, new RandomLookAroundGoal(this));
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

	void feedTreat(Player player, InteractionHand hand, ItemStack stack) {
		this.usePlayerItem(player, hand, stack);
		this.needs.feedTreat();
		if (this.level() instanceof ServerLevel level) {
			this.mutePeacefulMobBarking(level);
		}
		this.heal(3.0F);
		this.playSound(SoundEvents.EXPERIENCE_ORB_PICKUP, 0.5F, 1.6F);
		this.performTreatTrick();
	}

	void useInteractionItem(Player player, InteractionHand hand, ItemStack stack) {
		this.usePlayerItem(player, hand, stack);
	}

	/** Claims trust and vanilla taming together; use this path so one-owner checks and AI state stay aligned. */
	public void claimFor(Player player) {
		this.trust.claim(player);
		this.scaredRunTicks = 0;
		this.tame(player);
		this.setMushroomOrderedToSit(false);
		this.setSleeping(false);
	}

	private void performTreatTrick() {
		int trick = this.random.nextInt(4);
		switch (trick) {
			case 0 -> this.playSound(SoundEvents.WOLF_PANT, 0.45F, 1.45F);
			case 1 -> this.playSound(SoundEvents.WOLF_PANT, 0.5F, 1.45F);
			case 2 -> this.setDeltaMovement(this.getDeltaMovement().add(0.0D, 0.28D, 0.0D));
			default -> this.playSound(SoundEvents.WOLF_GROWL, 0.45F, 1.55F);
		}

		if (this.level() instanceof ServerLevel serverLevel) {
			serverLevel.sendParticles(ParticleTypes.HEART, this.getX(), this.getY() + 0.5D, this.getZ(), 4, 0.25D, 0.2D, 0.25D, 0.0D);
		}
	}

	boolean handleSleepingInteract(Player player) {
		boolean doubleClick = this.lastInteractPlayer != null
				&& this.lastInteractPlayer.equals(player.getUUID())
				&& this.tickCount - this.lastInteractTick <= DOUBLE_CLICK_TICKS;
		this.lastInteractPlayer = player.getUUID();
		this.lastInteractTick = this.tickCount;

		if (doubleClick) {
			this.nightWakeTicks = NIGHT_WAKE_TICKS;
			this.setSleeping(false);
			this.playSound(SoundEvents.WOLF_PANT, 0.35F, 1.45F);
		}
		return doubleClick;
	}

	@Override
	protected void customServerAiStep() {
		super.customServerAiStep();
		ServerLevel level = (ServerLevel) this.level();
		this.preventWaterSitting();
		MushroomFlightController.followFlyingOwner(this);
		MushroomOwnerContactHandler.tick(this, level);
		this.tickNightBehavior(level);
		MushroomOwnerPromptHandler.tick(this, level);
		MushroomDarknessPanicHandler.tick(this, level);
		MushroomNeedDecayHandler.tick(this, level);
		MushroomReliefHandler.tick(this, level);
		MushroomBehaviorDebugger.baseline(this, level);
		if (this.scaredRunTicks > 0) {
			this.scaredRunTicks--;
		}
	}

	@Override
	protected boolean canFlyToOwner() {
		return this.ownerIsCreative();
	}

	private void tickNightBehavior(ServerLevel level) {
		boolean sleepingAtNight = this.shouldSleepAtNight(level);
		if (!sleepingAtNight && !MushroomBehaviorProfiles.keepsCreativeBuilderFocus(this, level)) {
			this.setSleeping(false);
			if (!isNight(level)) {
				this.nightWakeTicks = 0;
			}
			return;
		}

		if (this.nightWakeTicks > 0) {
			this.nightWakeTicks--;
			this.setSleeping(false);
			return;
		}
	}

	boolean shouldSleepAtNight(ServerLevel level) {
		return this.isTame() && !this.ownerIsCreativeFlying() && isNight(level) && this.isInside(level);
	}

	boolean shouldAskToGoOutside(ServerLevel level) {
		return this.isTame()
				&& !this.isOrderedToSit()
				&& !this.ownerIsCreativeFlying()
				&& !this.shouldSleepAtNight(level)
				&& this.isInside(level)
				&& this.relief.shouldAskToday(currentDay(level), this.needs.shouldWarnPotty());
	}

	private boolean isInside(ServerLevel level) {
		return MushroomShelterDetector.isSheltered(level, this.blockPosition());
	}

	boolean isMushroomSleeping() {
		return this.entityData.get(DATA_SLEEPING);
	}

	void setSleeping(boolean sleeping) {
		this.entityData.set(DATA_SLEEPING, sleeping);
		this.updateSittingPose();
		if (sleeping) {
			this.getNavigation().stop();
			if (this.level() instanceof ServerLevel level) {
				BlockPos doorPos = MushroomDoorLocator.findNearestDoor(level, this.blockPosition());
				if (doorPos != null) {
					this.facePosition(Vec3.atBottomCenterOf(doorPos));
				}
			}
		}
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
		if (sitting && this.isWetForSitting()) {
			sitting = false;
		}
		this.setOrderedToSit(sitting);
		this.updateSittingPose();
	}

	private void updateSittingPose() {
		this.setInSittingPose(!this.isWetForSitting() && (this.isMushroomSleeping() || this.isOrderedToSit()));
	}

	private void preventWaterSitting() {
		if (this.isOrderedToSit() && this.isWetForSitting()) {
			this.setMushroomOrderedToSit(false);
			this.setSleeping(false);
			MushroomBehaviorDebugger.debug(this, "water_follow", "ordered: follow forced because Mushroom is in water", true);
		}
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

	private static boolean isNight(ServerLevel level) {
		long dayTime = level.getDayTime() % 24_000L;
		return dayTime >= NIGHT_START && dayTime <= NIGHT_END;
	}

	static long currentDay(ServerLevel level) {
		return level.getDayTime() / 24_000L;
	}

	void mutePeacefulMobBarking(ServerLevel level) {
		this.peacefulMobBarkMutedUntil = level.getGameTime() + PEACEFUL_MOB_BARK_MUTED_TICKS;
		this.peacefulMobMemory.rememberNearby(level, this);
	}

	boolean peacefulMobBarkingMuted(ServerLevel level) {
		return level.getGameTime() < this.peacefulMobBarkMutedUntil;
	}

	void hurtFromNeglect(ServerLevel level, float amount) {
		this.hurt(level.damageSources().starve(), amount);
	}

	void recordOwnerContact(ServerLevel level) {
		this.lastOwnerContactGameTime = level.getGameTime();
	}

	public long lastOwnerContactGameTime() {
		return this.lastOwnerContactGameTime;
	}

	public void recoverWithOwner(ServerLevel level) {
		this.stopRiding();
		this.setMushroomOrderedToSit(false);
		this.setSleeping(false);
		this.recordOwnerContact(level);
	}

	boolean wasScoldedToday(ServerLevel level) {
		return this.trust.wasScoldedToday(level);
	}

	Player playerToStayNear(ServerLevel level) {
		return this.trust.playerToStayNear(this, level);
	}

	@Override
	public boolean canBeLeashed() {
		return this.hasHarness() && super.canBeLeashed();
	}

	void bark() {
		this.playSound(SoundEvents.WOLF_AMBIENT, 0.5F, 1.45F);
	}

	void whine() {
		this.playSound(SoundEvents.WOLF_WHINE, 0.55F, 1.45F);
	}

	void playFoodSound() {
		this.playSound(SoundEvents.GENERIC_EAT, 0.45F, 1.45F);
	}

	private void facePosition(Vec3 target) {
		Vec3 delta = target.subtract(this.position());
		if (delta.horizontalDistanceSqr() < 1.0E-4D) {
			return;
		}

		float yaw = (float) (Math.atan2(delta.z, delta.x) * 180.0D / Math.PI) - 90.0F;
		this.setYRot(yaw);
		this.yBodyRot = yaw;
		this.yHeadRot = yaw;
		this.yRotO = yaw;
	}

	void setFlightTrick(int type, int ticks) {
		this.entityData.set(DATA_FLIGHT_TRICK_TYPE, type);
		this.entityData.set(DATA_FLIGHT_TRICK_TICKS, ticks);
	}

	void setFlightTrickTicks(int ticks) {
		this.entityData.set(DATA_FLIGHT_TRICK_TICKS, ticks);
	}

	public int getFlightTrickType() {
		return this.entityData.get(DATA_FLIGHT_TRICK_TYPE);
	}

	public int getFlightTrickTicks() {
		return this.entityData.get(DATA_FLIGHT_TRICK_TICKS);
	}

	boolean ownerIsCreativeFlying() {
		LivingEntity owner = this.getOwner();
		return owner instanceof Player player && player.isCreative() && player.getAbilities().flying;
	}

	boolean ownerIsCreative() {
		LivingEntity owner = this.getOwner();
		return owner instanceof Player player && player.isCreative() && owner.level() == this.level();
	}

	boolean isUsingCreativeFlight() {
		return this.isNoGravity();
	}

	boolean isWetForSitting() {
		return this.isInWater() || this.level().getFluidState(this.blockPosition()).is(FluidTags.WATER);
	}

	@Override
	public void addAdditionalSaveData(CompoundTag tag) {
		super.addAdditionalSaveData(tag);
		tag.putInt(HUNGER_KEY, this.needs.hunger());
		tag.putInt(POTTY_KEY, this.needs.potty());
		tag.putInt(MOOD_KEY, this.needs.mood());
		tag.putInt(ENERGY_KEY, this.needs.energy());
		tag.putInt(NIGHT_WAKE_TICKS_KEY, this.nightWakeTicks);
		tag.putBoolean(HARNESS_KEY, this.hasHarness());
		tag.putLong(PEACEFUL_MOB_BARK_MUTED_UNTIL_KEY, this.peacefulMobBarkMutedUntil);
		tag.putLong(LAST_FOOD_BOWL_DAY_KEY, this.domestic.lastFoodBowlDay());
		tag.putLong(LAST_WATER_BOWL_DAY_KEY, this.domestic.lastWaterBowlDay());
		tag.putLong(LAST_OWNER_CONTACT_GAME_TIME_KEY, this.lastOwnerContactGameTime);
		tag.putLong(LAST_RELIEF_DAY_KEY, this.relief.lastReliefDay());
		tag.putString(CALMED_PEACEFUL_MOBS_KEY, this.peacefulMobMemory.save());
		this.trust.save(tag);
	}

	@Override
	public void readAdditionalSaveData(CompoundTag tag) {
		super.readAdditionalSaveData(tag);
		this.needs = new PetNeeds(
				tag.contains(HUNGER_KEY) ? tag.getInt(HUNGER_KEY) : PetNeeds.DEFAULT_HUNGER,
				tag.contains(POTTY_KEY) ? tag.getInt(POTTY_KEY) : PetNeeds.DEFAULT_POTTY,
				tag.contains(MOOD_KEY) ? tag.getInt(MOOD_KEY) : PetNeeds.DEFAULT_MOOD,
				tag.contains(ENERGY_KEY) ? tag.getInt(ENERGY_KEY) : PetNeeds.DEFAULT_ENERGY
		);
		this.nightWakeTicks = tag.contains(NIGHT_WAKE_TICKS_KEY) ? tag.getInt(NIGHT_WAKE_TICKS_KEY) : 0;
		this.setHarness(tag.contains(HARNESS_KEY) && tag.getBoolean(HARNESS_KEY));
		this.peacefulMobBarkMutedUntil = tag.contains(PEACEFUL_MOB_BARK_MUTED_UNTIL_KEY) ? tag.getLong(PEACEFUL_MOB_BARK_MUTED_UNTIL_KEY) : -1L;
		this.domestic.setLastFoodBowlDay(tag.contains(LAST_FOOD_BOWL_DAY_KEY) ? tag.getLong(LAST_FOOD_BOWL_DAY_KEY) : DomesticCarePolicy.unloadedDay());
		this.domestic.setLastWaterBowlDay(tag.contains(LAST_WATER_BOWL_DAY_KEY) ? tag.getLong(LAST_WATER_BOWL_DAY_KEY) : DomesticCarePolicy.unloadedDay());
		this.lastOwnerContactGameTime = tag.contains(LAST_OWNER_CONTACT_GAME_TIME_KEY) ? tag.getLong(LAST_OWNER_CONTACT_GAME_TIME_KEY) : 0L;
		this.relief.setLastReliefDay(tag.contains(LAST_RELIEF_DAY_KEY) ? tag.getLong(LAST_RELIEF_DAY_KEY) : MushroomReliefState.neverRelievedDay());
		this.peacefulMobMemory.read(tag.contains(CALMED_PEACEFUL_MOBS_KEY) ? tag.getString(CALMED_PEACEFUL_MOBS_KEY) : "");
		this.trust.read(tag);
	}

	@Override
	public boolean hurt(DamageSource damageSource, float amount) {
		boolean hurt = super.hurt(damageSource, amount);
		if (hurt && this.level() instanceof ServerLevel level && damageSource.getEntity() instanceof Player player && this.belongsTo(player)) {
			this.recordTrustedPlayerHit(level, player);
		}

		return hurt;
	}

	private void recordTrustedPlayerHit(ServerLevel level, Player player) {
		if (!this.trust.recordTrustedPlayerHit(level, player)) {
			return;
		}

		this.scaredRunTicks = SCARED_RUN_TICKS;
		MushroomBehaviorDebugger.debug(this, "scolded", "scolded: trusted player hit Mushroom, backing away", true);
		this.setMushroomOrderedToSit(false);
		this.setSleeping(false);
		this.setOwnerUUID(null);
		this.setTame(false, true);
		this.playSound(SoundEvents.WOLF_WHINE, 0.7F, 1.45F);
	}

	@Override
	protected net.minecraft.sounds.SoundEvent getAmbientSound() {
		return null;
	}

	@Override
	protected net.minecraft.sounds.SoundEvent getHurtSound(DamageSource damageSource) {
		return SoundEvents.WOLF_HURT;
	}

	@Override
	protected net.minecraft.sounds.SoundEvent getDeathSound() {
		return SoundEvents.WOLF_DEATH;
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
