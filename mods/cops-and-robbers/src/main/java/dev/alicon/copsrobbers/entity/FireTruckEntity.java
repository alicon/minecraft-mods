package dev.alicon.copsrobbers.entity;

import dev.alicon.copsrobbers.fire.FireResponseHandler;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;

/** Rideable fire truck with an automatic water cannon. */
public final class FireTruckEntity extends PoliceCruiserEntity {
	/** Fire truck variant of cruiser controls; job handling is replaced with water-spray behavior. */
	public FireTruckEntity(EntityType<? extends FireTruckEntity> entityType, Level level) {
		super(entityType, level);
	}

	/** Creates fire truck attributes. */
	public static AttributeSupplier.Builder createAttributes() {
		return Mob.createMobAttributes()
				.add(Attributes.MAX_HEALTH, 48.0D)
				.add(Attributes.MOVEMENT_SPEED, 0.32D)
				.add(Attributes.KNOCKBACK_RESISTANCE, 0.9D)
				.add(Attributes.STEP_HEIGHT, 1.0D)
				.add(Attributes.SAFE_FALL_DISTANCE, 6.0D);
	}

	@Override
	protected void tickJobHandlers() {
		if (this.level() instanceof ServerLevel level && this.getControllingPassenger() instanceof Player && this.tickCount % 5 == 0) {
			Vec3 look = this.getLookAngle();
			if (FireResponseHandler.sprayWater(level, this.blockPosition().above(), look.x, look.z, 10, 2)) {
				level.playSound(null, this.blockPosition(), SoundEvents.BUCKET_EMPTY, SoundSource.PLAYERS, 0.55F, 1.5F);
			}
		}
	}
}
