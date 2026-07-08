package dev.alicon.copsrobbers.entity;

import net.minecraft.core.BlockPos;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.phys.Vec3;

final class BankRobberScatterHandler {
	private static final double SNEAKY_SCATTER_RADIUS = 6.0D;
	private static final double ALERT_SCATTER_RADIUS = 15.0D;
	private static final double COP_SCATTER_RADIUS = 10.0D;
	private static final double SCATTER_DISTANCE = 9.0D;
	private static final double SCATTER_SPEED = 1.45D;
	private static final double JAILED_SCATTER_SPEED = 1.05D;

	private BankRobberScatterHandler() {
	}

	static void scatterFromNearbyCruiser(BankRobberEntity robber, ServerLevel level) {
		if (robber.scatterCooldownTicks > 0) {
			robber.scatterCooldownTicks--;
			return;
		}

		Vec3 scaryPosition = nearestScaryPosition(robber, level);
		if (scaryPosition == null) {
			return;
		}

		robber.scatterCooldownTicks = 8 + robber.getRandom().nextInt(8);
		Vec3 away = robber.position().subtract(scaryPosition).multiply(1.0D, 0.0D, 1.0D);
		if (away.lengthSqr() < 0.01D) {
			away = Vec3.directionFromRotation(0.0F, robber.getRandom().nextFloat() * 360.0F);
		}

		double angle = (robber.getRandom().nextDouble() - 0.5D) * 1.6D;
		double cos = Math.cos(angle);
		double sin = Math.sin(angle);
		Vec3 direction = away.normalize();
		Vec3 scattered = new Vec3(direction.x * cos - direction.z * sin, 0.0D, direction.x * sin + direction.z * cos).normalize();
		BlockPos target = BlockPos.containing(robber.position().add(scattered.scale(SCATTER_DISTANCE + robber.getRandom().nextDouble() * 4.0D)));
		target = level.getHeightmapPos(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, target);
		robber.setTarget(null);
		robber.getNavigation().moveTo(target.getX() + 0.5D, target.getY(), target.getZ() + 0.5D, robber.isJailed() ? JAILED_SCATTER_SPEED : SCATTER_SPEED);
	}

	private static Vec3 nearestScaryPosition(BankRobberEntity robber, ServerLevel level) {
		Vec3 nearest = null;
		double nearestDistance = Double.MAX_VALUE;
		for (PoliceCruiserEntity cruiser : level.getEntities(ModEntities.POLICE_CRUISER, robber.getBoundingBox().inflate(ALERT_SCATTER_RADIUS), PoliceCruiserEntity::isVehicle)) {
			double scatterRadius = cruiser.lightsEnabled() || cruiser.sirenEnabled() ? ALERT_SCATTER_RADIUS : SNEAKY_SCATTER_RADIUS;
			double distance = robber.distanceToSqr(cruiser);
			if (distance <= scatterRadius * scatterRadius && distance < nearestDistance) {
				nearest = cruiser.position();
				nearestDistance = distance;
			}
		}
		for (CopEntity cop : level.getEntities(ModEntities.COP, robber.getBoundingBox().inflate(COP_SCATTER_RADIUS), CopEntity::isAlive)) {
			double distance = robber.distanceToSqr(cop);
			if (distance <= COP_SCATTER_RADIUS * COP_SCATTER_RADIUS && distance < nearestDistance) {
				nearest = cop.position();
				nearestDistance = distance;
			}
		}
		return nearest;
	}
}
