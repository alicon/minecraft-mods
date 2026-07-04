package dev.alicon.copsrobbers.entity;

import dev.alicon.copsrobbers.fire.FireResponseHandler;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.ai.goal.FloatGoal;
import net.minecraft.world.entity.ai.goal.LookAtPlayerGoal;
import net.minecraft.world.entity.ai.goal.RandomStrollGoal;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;

/** Friendly firefighter NPC that prioritizes putting out fires. */
public final class FiremanEntity extends PathfinderMob {
	/** Persistent responder NPC; fire-search behavior is intentionally centralized in FireResponseHandler. */
	public FiremanEntity(EntityType<? extends FiremanEntity> entityType, Level level) {
		super(entityType, level);
		this.setPersistenceRequired();
	}

	/** Creates fireman attributes. */
	public static AttributeSupplier.Builder createAttributes() {
		return PathfinderMob.createMobAttributes()
				.add(Attributes.MAX_HEALTH, 24.0D)
				.add(Attributes.MOVEMENT_SPEED, 0.3D)
				.add(Attributes.FOLLOW_RANGE, 40.0D);
	}

	@Override
	protected void registerGoals() {
		this.goalSelector.addGoal(0, new FloatGoal(this));
		this.goalSelector.addGoal(6, new RandomStrollGoal(this, 0.85D));
		this.goalSelector.addGoal(8, new LookAtPlayerGoal(this, Player.class, 8.0F));
	}

	@Override
	public void aiStep() {
		super.aiStep();
		if (this.level() instanceof ServerLevel level) {
			FireResponseHandler.tryExtinguishNearby(this, level, 24);
		}
	}

	@Override
	public boolean removeWhenFarAway(double distanceToClosestPlayer) {
		return false;
	}
}
