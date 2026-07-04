package dev.alicon.copsrobbers.entity;

import dev.alicon.copsrobbers.bank.BankHeistHandler;
import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.ai.goal.FloatGoal;
import net.minecraft.world.entity.ai.goal.LookAtPlayerGoal;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;

/** Passive bank teller that panics when robbers enter the bank. */
public final class TellerEntity extends PathfinderMob {
	private static final String COUNTER_X_TAG = "counter_x";
	private static final String COUNTER_Y_TAG = "counter_y";
	private static final String COUNTER_Z_TAG = "counter_z";
	private BlockPos counterPos;
	private int panicTicks;

	/** Persistent bank NPC; counter position is saved so generated banks recover after world reloads. */
	public TellerEntity(EntityType<? extends TellerEntity> entityType, Level level) {
		super(entityType, level);
		this.setPersistenceRequired();
	}

	@Override
	public boolean removeWhenFarAway(double distanceToClosestPlayer) {
		return false;
	}

	/** Creates teller attributes. */
	public static AttributeSupplier.Builder createAttributes() {
		return PathfinderMob.createMobAttributes()
				.add(Attributes.MAX_HEALTH, 20.0D)
				.add(Attributes.MOVEMENT_SPEED, 0.3D)
				.add(Attributes.FOLLOW_RANGE, 24.0D);
	}

	@Override
	protected void registerGoals() {
		this.goalSelector.addGoal(0, new FloatGoal(this));
		this.goalSelector.addGoal(8, new LookAtPlayerGoal(this, Player.class, 8.0F));
	}

	@Override
	protected void addAdditionalSaveData(ValueOutput output) {
		super.addAdditionalSaveData(output);
		if (this.counterPos != null) {
			output.putInt(COUNTER_X_TAG, this.counterPos.getX());
			output.putInt(COUNTER_Y_TAG, this.counterPos.getY());
			output.putInt(COUNTER_Z_TAG, this.counterPos.getZ());
		}
	}

	@Override
	protected void readAdditionalSaveData(ValueInput input) {
		super.readAdditionalSaveData(input);
		this.counterPos = new BlockPos(
				input.getIntOr(COUNTER_X_TAG, this.blockPosition().getX()),
				input.getIntOr(COUNTER_Y_TAG, this.blockPosition().getY()),
				input.getIntOr(COUNTER_Z_TAG, this.blockPosition().getZ())
		);
	}

	@Override
	public void aiStep() {
		super.aiStep();
		if (this.level() instanceof ServerLevel level) {
			if (this.panicTicks > 0) {
				this.panicTicks--;
			}
			BankHeistHandler.tickTeller(this, level);
		}
	}

	/** Remembers where this teller should stand when calm. */
	public void setCounterPos(BlockPos counterPos) {
		this.counterPos = counterPos.immutable();
	}

	/** Makes this teller stay panicked for a while. */
	public void panicFor(int ticks) {
		this.panicTicks = Math.max(this.panicTicks, ticks);
	}

	/** Returns to the teller counter when no robber is causing panic. */
	public void returnToCounter(ServerLevel level) {
		if (this.panicTicks > 0 || this.counterPos == null || this.distanceToSqr(this.counterPos.getCenter()) < 3.0D) {
			return;
		}
		this.getNavigation().moveTo(this.counterPos.getX() + 0.5D, this.counterPos.getY(), this.counterPos.getZ() + 0.5D, 0.75D);
	}
}
