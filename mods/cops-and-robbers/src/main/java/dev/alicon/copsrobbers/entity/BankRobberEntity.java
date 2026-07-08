package dev.alicon.copsrobbers.entity;

import dev.alicon.copsrobbers.bank.BankHeistHandler;
import dev.alicon.copsrobbers.capture.PoliceCaptureHandler;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.monster.Monster;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;
import net.minecraft.world.phys.AABB;

/** Hostile robber mob that menaces villages and can be captured by police trucks. */
public final class BankRobberEntity extends Monster {
	private static final double CAPTURE_RADIUS = 2.35D;
	private static final EntityDataAccessor<Boolean> STOLEN_GOLD =
			SynchedEntityData.defineId(BankRobberEntity.class, EntityDataSerializers.BOOLEAN);
	int arsonCooldown;
	int scatterCooldownTicks;
	boolean jailed;
	boolean specialJailbreaker;
	boolean bankFireLit;
	long jailedAtTime;
	int robberiesToday;
	long lastRobberyDay = -1L;
	long chillUntilTick;

	/** Keeps robber persistence and jail/gold state owned by the entity while heist rules live in handlers. */
	public BankRobberEntity(EntityType<? extends BankRobberEntity> entityType, Level level) {
		super(entityType, level);
		this.setPersistenceRequired();
	}

	/** Creates robber attributes. */
	public static AttributeSupplier.Builder createAttributes() {
		return Monster.createMonsterAttributes()
				.add(Attributes.MAX_HEALTH, 18.0D)
				.add(Attributes.MOVEMENT_SPEED, 0.28D)
				.add(Attributes.ATTACK_DAMAGE, 0.5D)
				.add(Attributes.FOLLOW_RANGE, 32.0D);
	}

	@Override
	public boolean removeWhenFarAway(double distanceToClosestPlayer) {
		return false;
	}

	@Override
	protected void defineSynchedData(SynchedEntityData.Builder builder) {
		super.defineSynchedData(builder);
		builder.define(STOLEN_GOLD, false);
	}

	@Override
	protected void addAdditionalSaveData(ValueOutput output) {
		super.addAdditionalSaveData(output);
		BankRobberPersistence.save(this, output);
	}

	@Override
	protected void readAdditionalSaveData(ValueInput input) {
		super.readAdditionalSaveData(input);
		BankRobberPersistence.read(this, input);
	}

	@Override
	protected void registerGoals() {
		BankRobberGoals.register(this);
	}

	void addRobberGoal(int priority, Goal goal) {
		this.goalSelector.addGoal(priority, goal);
	}

	void addRobberTargetGoal(int priority, Goal goal) {
		this.targetSelector.addGoal(priority, goal);
	}

	@Override
	public void aiStep() {
		super.aiStep();
		if (this.level().isClientSide()) {
			return;
		}

		if (!(this.level() instanceof ServerLevel level)) {
			return;
		}

		if (this.jailed && !this.handleJailTick(level)) {
			return;
		}

		if (!this.jailed && this.tryCapturedByNearbyCruiser(level)) {
			return;
		}

		this.resetDailyRobberyCount(level);
		BankRobberScatterHandler.scatterFromNearbyCruiser(this, level);
		BankHeistHandler.tickRobber(this, level);
		BankRobberArsonHandler.tick(this, level);
	}

	private boolean tryCapturedByNearbyCruiser(ServerLevel level) {
		for (PoliceCruiserEntity cruiser : level.getEntities(ModEntities.POLICE_CRUISER, this.getBoundingBox().inflate(CAPTURE_RADIUS, 0.95D, CAPTURE_RADIUS), PoliceCruiserEntity::isVehicle)) {
			if (PoliceCaptureHandler.captureRobber(cruiser, this)) {
				return true;
			}
		}
		return false;
	}

	private boolean handleJailTick(ServerLevel level) {
		this.setTarget(null);
		if (BankRobberSchedulePolicy.canJailbreak(this.specialJailbreaker, level.getGameTime(), this.jailedAtTime, level.getDayTime())) {
			PoliceCaptureHandler.triggerJailbreak(this, level);
			return false;
		}
		if (!PoliceCaptureHandler.isSecureJailSpot(level, this.blockPosition())) {
			this.releaseFromJail();
			level.playSound(null, this.blockPosition(), SoundEvents.IRON_DOOR_OPEN, SoundSource.HOSTILE, 0.8F, 1.25F);
			return false;
		}
		return true;
	}

	/** Returns whether this robber is already detained in jail. */
	public boolean isJailed() {
		return this.jailed;
	}

	/** Returns whether this jailed robber is the rare overnight jailbreak leader. */
	public boolean isSpecialJailbreaker() {
		return this.specialJailbreaker;
	}

	/** Returns whether this robber has been jailed for at least a full Minecraft day. */
	public boolean hasServedFullDay(ServerLevel level) {
		return BankRobberSchedulePolicy.hasServedSentence(this.jailed, level.getGameTime(), this.jailedAtTime);
	}

	/** Returns whether this robber is visibly carrying stolen gold. */
	public boolean hasStolenGold() {
		return this.entityData.get(STOLEN_GOLD);
	}

	/** Marks this robber as carrying a stolen gold ingot. */
	public void stealGold() {
		this.setStolenGoldCarried(true);
		this.robberiesToday++;
	}

	/** Clears carried stolen gold after capture. */
	public void clearStolenGold() {
		this.setStolenGoldCarried(false);
	}

	void setStolenGoldCarried(boolean stolen) {
		this.entityData.set(STOLEN_GOLD, stolen);
		BankRobberPersistence.syncStolenGoldItem(this, stolen);
	}

	/** Returns whether this robber already started the bank fire. */
	public boolean hasLitBankFire() {
		return this.bankFireLit;
	}

	/** Marks the bank fire as started. */
	public void markBankFireLit() {
		this.bankFireLit = true;
	}

	/** Returns whether this robber can start another bank robbery today. */
	public boolean canRobToday(ServerLevel level) {
		this.resetDailyRobberyCount(level);
		return this.robberiesToday < 3 && level.getGameTime() >= this.chillUntilTick;
	}

	/** Sets a short hideout cooldown before this robber robs another bank. */
	public void chillAtHideout(ServerLevel level) {
		this.clearStolenGold();
		this.bankFireLit = false;
		this.chillUntilTick = level.getGameTime() + 1200L + this.random.nextInt(3600);
	}

	/** Freezes this robber as a jail prisoner display. */
	public void jail(boolean specialJailbreaker) {
		this.jailed = true;
		this.specialJailbreaker = specialJailbreaker;
		this.jailedAtTime = this.level().getGameTime();
		this.setTarget(null);
		this.setPersistenceRequired();
	}

	/** Releases this robber from jail so it can run again. */
	public void releaseFromJail() {
		this.jailed = false;
		this.specialJailbreaker = false;
	}

	private void resetDailyRobberyCount(ServerLevel level) {
		long day = BankRobberSchedulePolicy.day(level.getDayTime());
		if (day != this.lastRobberyDay) {
			this.lastRobberyDay = day;
			this.robberiesToday = 0;
		}
	}
}
