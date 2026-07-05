package dev.alicon.mushroomyorkie.item;

import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;

final class YorkieBallThrower {
	private static final double THROW_SPEED = 1.25D;
	private static final double UPWARD_ARC = 0.18D;

	private YorkieBallThrower() {
	}

	static ItemStack throwBall(Level level, Player player, InteractionHand hand) {
		ItemStack stack = player.getItemInHand(hand);
		level.playSound(null, player.getX(), player.getY(), player.getZ(), SoundEvents.SNOWBALL_THROW, SoundSource.NEUTRAL, 0.5F, 1.2F);
		if (!(level instanceof ServerLevel serverLevel)) {
			return stack;
		}

		ItemStack thrownStack = stack.copyWithCount(1);
		Vec3 look = player.getLookAngle();
		Vec3 start = player.position()
				.add(0.0D, player.getEyeHeight() - 0.2D, 0.0D)
				.add(look.scale(0.45D));
		Vec3 velocity = look.scale(THROW_SPEED).add(0.0D, UPWARD_ARC, 0.0D);
		ItemEntity ball = new ItemEntity(serverLevel, start.x, start.y, start.z, thrownStack, velocity.x, velocity.y, velocity.z);
		ball.setThrower(player);
		ball.setPickUpDelay(20);
		serverLevel.addFreshEntity(ball);

		if (!player.isCreative()) {
			stack.shrink(1);
		}
		return stack;
	}
}
