package dev.alicon.copsrobbers.entity;

import dev.alicon.copsrobbers.bank.BankHeistHandler;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.ai.goal.FloatGoal;
import net.minecraft.world.entity.ai.goal.LookAtPlayerGoal;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;

/** Foot patrol cop that chases robbers but is just too slow to catch them. */
public final class CopEntity extends PathfinderMob {
	/** Lightweight patrol NPC; heist behavior is delegated to BankHeistHandler during server AI ticks. */
	public CopEntity(EntityType<? extends CopEntity> entityType, Level level) {
		super(entityType, level);
	}

	/** Creates cop attributes. */
	public static AttributeSupplier.Builder createAttributes() {
		return PathfinderMob.createMobAttributes()
				.add(Attributes.MAX_HEALTH, 24.0D)
				.add(Attributes.MOVEMENT_SPEED, 0.29D)
				.add(Attributes.FOLLOW_RANGE, 40.0D);
	}

	@Override
	protected void registerGoals() {
		this.goalSelector.addGoal(0, new FloatGoal(this));
		this.goalSelector.addGoal(8, new LookAtPlayerGoal(this, Player.class, 8.0F));
	}

	@Override
	public void aiStep() {
		super.aiStep();
		if (this.level() instanceof ServerLevel level) {
			BankHeistHandler.tickCop(this, level);
		}
	}
}
