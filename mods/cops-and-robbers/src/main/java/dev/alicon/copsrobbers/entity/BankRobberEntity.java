package dev.alicon.copsrobbers.entity;

import dev.alicon.copsrobbers.bank.BankHeistHandler;
import dev.alicon.copsrobbers.capture.PoliceCaptureHandler;
import net.minecraft.core.BlockPos;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.ai.goal.FloatGoal;
import net.minecraft.world.entity.ai.goal.LookAtPlayerGoal;
import net.minecraft.world.entity.ai.goal.MeleeAttackGoal;
import net.minecraft.world.entity.ai.goal.RandomStrollGoal;
import net.minecraft.world.entity.ai.goal.target.HurtByTargetGoal;
import net.minecraft.world.entity.ai.goal.target.NearestAttackableTargetGoal;
import net.minecraft.world.entity.monster.Monster;
import net.minecraft.world.entity.npc.villager.Villager;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/** Hostile robber mob that menaces villages and can be captured by police trucks. */
public final class BankRobberEntity extends Monster {
	private static final String JAILED_TAG = "jailed";
	private static final String SPECIAL_JAILBREAKER_TAG = "special_jailbreaker";
	private static final String JAILED_AT_TIME_TAG = "jailed_at_time";
	private static final String STOLEN_GOLD_TAG = "stolen_gold";
	private static final String BANK_FIRE_LIT_TAG = "bank_fire_lit";
	private static final String ROBBERIES_TODAY_TAG = "robberies_today";
	private static final String LAST_ROBBERY_DAY_TAG = "last_robbery_day";
	private static final String CHILL_UNTIL_TICK_TAG = "chill_until_tick";
	private static final double CAPTURE_RADIUS = 2.35D;
	private static final double SNEAKY_SCATTER_RADIUS = 6.0D;
	private static final double ALERT_SCATTER_RADIUS = 15.0D;
	private static final double COP_SCATTER_RADIUS = 10.0D;
	private static final double SCATTER_DISTANCE = 9.0D;
	private static final double SCATTER_SPEED = 1.45D;
	private static final double JAILED_SCATTER_SPEED = 1.05D;
	private static final long JAILBREAK_MIN_TICKS = 600L;
	private static final EntityDataAccessor<Boolean> STOLEN_GOLD =
			SynchedEntityData.defineId(BankRobberEntity.class, EntityDataSerializers.BOOLEAN);
	private int arsonCooldown;
	private int scatterCooldownTicks;
	private boolean jailed;
	private boolean specialJailbreaker;
	private boolean bankFireLit;
	private long jailedAtTime;
	private int robberiesToday;
	private long lastRobberyDay = -1L;
	private long chillUntilTick;

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
		output.putBoolean(JAILED_TAG, this.jailed);
		output.putBoolean(SPECIAL_JAILBREAKER_TAG, this.specialJailbreaker);
		output.putBoolean(STOLEN_GOLD_TAG, this.hasStolenGold());
		output.putBoolean(BANK_FIRE_LIT_TAG, this.bankFireLit);
		output.putLong(JAILED_AT_TIME_TAG, this.jailedAtTime);
		output.putInt(ROBBERIES_TODAY_TAG, this.robberiesToday);
		output.putLong(LAST_ROBBERY_DAY_TAG, this.lastRobberyDay);
		output.putLong(CHILL_UNTIL_TICK_TAG, this.chillUntilTick);
	}

	@Override
	protected void readAdditionalSaveData(ValueInput input) {
		super.readAdditionalSaveData(input);
		this.jailed = input.getBooleanOr(JAILED_TAG, false);
		this.specialJailbreaker = input.getBooleanOr(SPECIAL_JAILBREAKER_TAG, false);
		this.entityData.set(STOLEN_GOLD, input.getBooleanOr(STOLEN_GOLD_TAG, false));
		this.bankFireLit = input.getBooleanOr(BANK_FIRE_LIT_TAG, false);
		this.jailedAtTime = input.getLongOr(JAILED_AT_TIME_TAG, 0L);
		this.robberiesToday = input.getIntOr(ROBBERIES_TODAY_TAG, 0);
		this.lastRobberyDay = input.getLongOr(LAST_ROBBERY_DAY_TAG, -1L);
		this.chillUntilTick = input.getLongOr(CHILL_UNTIL_TICK_TAG, 0L);
		if (this.hasStolenGold()) {
			this.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.GOLD_INGOT));
		}
	}

	@Override
	protected void registerGoals() {
		this.goalSelector.addGoal(0, new FloatGoal(this));
		this.goalSelector.addGoal(2, new MeleeAttackGoal(this, 1.05D, true));
		this.goalSelector.addGoal(6, new RandomStrollGoal(this, 0.9D));
		this.goalSelector.addGoal(7, new LookAtPlayerGoal(this, Player.class, 8.0F));
		this.targetSelector.addGoal(1, new HurtByTargetGoal(this));
		this.targetSelector.addGoal(2, new NearestAttackableTargetGoal<>(this, Villager.class, true));
		this.targetSelector.addGoal(3, new NearestAttackableTargetGoal<>(this, Player.class, true));
	}

	@Override
	public void aiStep() {
		super.aiStep();
		if (this.level().isClientSide()) {
			return;
		}

		if (this.level() instanceof ServerLevel level && this.jailed && !this.handleJailTick(level)) {
			return;
		}

		if (this.level() instanceof ServerLevel level && !this.jailed && this.tryCapturedByNearbyCruiser(level)) {
			return;
		}

		if (this.level() instanceof ServerLevel level) {
			this.resetDailyRobberyCount(level);
			this.scatterFromNearbyCruiser(level);
			BankHeistHandler.tickRobber(this, level);
		}

		if (this.jailed || !(this.level() instanceof ServerLevel level) || !this.isDaytime(level) || this.arsonCooldown-- > 0 || this.random.nextInt(120) != 0) {
			return;
		}

		this.arsonCooldown = 100;
		BlockPos around = this.blockPosition().offset(this.random.nextInt(7) - 3, 0, this.random.nextInt(7) - 3);
		BlockPos firePos = around.above();
		if (level.isCloseToVillage(this.blockPosition(), 3)
				&& this.level().isEmptyBlock(firePos)
				&& Blocks.FIRE.defaultBlockState().canSurvive(this.level(), firePos)) {
			this.level().setBlock(firePos, Blocks.FIRE.defaultBlockState(), 3);
			this.level().playSound(null, firePos, SoundEvents.FLINTANDSTEEL_USE, SoundSource.HOSTILE, 0.7F, 0.8F);
		}
	}

	private boolean tryCapturedByNearbyCruiser(ServerLevel level) {
		for (PoliceCruiserEntity cruiser : level.getEntities(ModEntities.POLICE_CRUISER, this.getBoundingBox().inflate(CAPTURE_RADIUS, 0.95D, CAPTURE_RADIUS), PoliceCruiserEntity::isVehicle)) {
			if (PoliceCaptureHandler.captureRobber(cruiser, this)) {
				return true;
			}
		}
		return false;
	}

	private void scatterFromNearbyCruiser(ServerLevel level) {
		if (this.scatterCooldownTicks > 0) {
			this.scatterCooldownTicks--;
			return;
		}

		Vec3 scaryPosition = this.nearestScaryPosition(level);
		if (scaryPosition == null) {
			return;
		}

		this.scatterCooldownTicks = 8 + this.random.nextInt(8);
		Vec3 away = this.position().subtract(scaryPosition).multiply(1.0D, 0.0D, 1.0D);
		if (away.lengthSqr() < 0.01D) {
			away = Vec3.directionFromRotation(0.0F, this.random.nextFloat() * 360.0F);
		}

		double angle = (this.random.nextDouble() - 0.5D) * 1.6D;
		double cos = Math.cos(angle);
		double sin = Math.sin(angle);
		Vec3 direction = away.normalize();
		Vec3 scattered = new Vec3(direction.x * cos - direction.z * sin, 0.0D, direction.x * sin + direction.z * cos).normalize();
		BlockPos target = BlockPos.containing(this.position().add(scattered.scale(SCATTER_DISTANCE + this.random.nextDouble() * 4.0D)));
		target = level.getHeightmapPos(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, target);
		this.setTarget(null);
		this.getNavigation().moveTo(target.getX() + 0.5D, target.getY(), target.getZ() + 0.5D, this.jailed ? JAILED_SCATTER_SPEED : SCATTER_SPEED);
	}

	private Vec3 nearestScaryPosition(ServerLevel level) {
		Vec3 nearest = null;
		double nearestDistance = Double.MAX_VALUE;
		for (PoliceCruiserEntity cruiser : level.getEntities(ModEntities.POLICE_CRUISER, this.getBoundingBox().inflate(ALERT_SCATTER_RADIUS), PoliceCruiserEntity::isVehicle)) {
			double scatterRadius = cruiser.lightsEnabled() || cruiser.sirenEnabled() ? ALERT_SCATTER_RADIUS : SNEAKY_SCATTER_RADIUS;
			double distance = this.distanceToSqr(cruiser);
			if (distance <= scatterRadius * scatterRadius && distance < nearestDistance) {
				nearest = cruiser.position();
				nearestDistance = distance;
			}
		}
		for (CopEntity cop : level.getEntities(ModEntities.COP, this.getBoundingBox().inflate(COP_SCATTER_RADIUS), CopEntity::isAlive)) {
			double distance = this.distanceToSqr(cop);
			if (distance <= COP_SCATTER_RADIUS * COP_SCATTER_RADIUS && distance < nearestDistance) {
				nearest = cop.position();
				nearestDistance = distance;
			}
		}
		return nearest;
	}

	private boolean handleJailTick(ServerLevel level) {
		this.setTarget(null);
		if (this.specialJailbreaker && this.isNight(level) && level.getGameTime() - this.jailedAtTime > JAILBREAK_MIN_TICKS) {
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

	private boolean isNight(ServerLevel level) {
		long dayTime = level.getDayTime() % 24000L;
		return dayTime >= 13000L && dayTime <= 23000L;
	}

	private boolean isDaytime(ServerLevel level) {
		long dayTime = level.getDayTime() % 24000L;
		return dayTime >= 1000L && dayTime <= 12000L;
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
		return this.jailed && level.getGameTime() - this.jailedAtTime >= 24000L;
	}

	/** Returns whether this robber is visibly carrying stolen gold. */
	public boolean hasStolenGold() {
		return this.entityData.get(STOLEN_GOLD);
	}

	/** Marks this robber as carrying a stolen gold ingot. */
	public void stealGold() {
		this.entityData.set(STOLEN_GOLD, true);
		this.robberiesToday++;
		this.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.GOLD_INGOT));
	}

	/** Clears carried stolen gold after capture. */
	public void clearStolenGold() {
		this.entityData.set(STOLEN_GOLD, false);
		this.setItemInHand(InteractionHand.MAIN_HAND, ItemStack.EMPTY);
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
		long day = level.getDayTime() / 24000L;
		if (day != this.lastRobberyDay) {
			this.lastRobberyDay = day;
			this.robberiesToday = 0;
		}
	}
}
