package dev.alicon.mushroomyorkie.entity;

import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.Vec3;

/** Removes the real support after a native climb; leaves movement and fall damage active. */
final class SquirrelTreeRemovalProbe {
	private final GameTestHelper helper;
	private final SquirrelEntity squirrel;
	private int ticks, stableTicks, removedAt = -1, landedTicks;
	private double clingingY;

	SquirrelTreeRemovalProbe(GameTestHelper helper, SquirrelEntity squirrel) {
		this.helper = helper;
		this.squirrel = squirrel;
	}

	void start() {
		this.helper.runAfterDelay(1, this::tick);
	}

	private void tick() {
		this.ticks++;
		try {
			this.helper.assertTrue(this.squirrel.isAlive(), "Squirrel died after its tree was removed");
			if (this.removedAt < 0) {
				this.helper.assertTrue(this.squirrel.getHealth() == this.squirrel.getMaxHealth(),
						"Tree-removal setup lost health during the native climb");
				boolean clinging = this.squirrel.hasFoundTree() && this.squirrel.isNoGravity()
						&& this.squirrel.getY() >= this.helper.absoluteVec(Vec3.ZERO).y + 4.8D;
				this.stableTicks = clinging ? this.stableTicks + 1 : 0;
				if (this.stableTicks >= 40) {
					this.clingingY = this.squirrel.getY();
					this.removedAt = this.ticks;
					for (int y = 1; y <= 5; y++) this.helper.setBlock(4, y, 4, Blocks.AIR);
					this.helper.setBlock(4, 3, 3, Blocks.AIR);
				}
			} else if (this.ticks - this.removedAt >= 5) {
				this.helper.assertTrue(!this.squirrel.isNoGravity() && !this.squirrel.hasFoundTree(),
						"Squirrel kept clinging after its trunk disappeared");
				boolean landed = this.squirrel.onGround() && this.squirrel.getY() < this.clingingY - 2.0D;
				this.landedTicks = landed ? this.landedTicks + 1 : 0;
				if (this.landedTicks >= 10) {
					this.squirrel.discard();
					this.helper.succeed();
					return;
				}
			}
			this.helper.assertTrue(this.ticks < 300,
					"Squirrel failed native tree-removal recovery: removedAt=" + this.removedAt
							+ ", position=" + this.squirrel.position() + ", onGround=" + this.squirrel.onGround());
		} catch (RuntimeException | Error failure) {
			this.squirrel.discard();
			throw failure;
		}
		this.start();
	}
}
