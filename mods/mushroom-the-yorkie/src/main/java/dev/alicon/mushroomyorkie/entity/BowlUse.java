package dev.alicon.mushroomyorkie.entity;

import dev.alicon.mushroomyorkie.block.ModBlocks;
import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.level.block.Block;

enum BowlUse {
	FOOD("food", ModBlocks.DOG_FOOD_BOWL) {
		@Override
		boolean isNeededBy(MushroomYorkieEntity yorkie, long day) {
			return yorkie.domestic.canEatFoodBowl(day, yorkie.needs.hunger());
		}

		@Override
		BlockPos findNearest(ServerLevel level, BlockPos origin) {
			return MushroomDomesticLocator.findNearestFoodBowl(level, origin);
		}

		@Override
		void apply(MushroomYorkieEntity yorkie, long day) {
			yorkie.domestic.recordFoodBowl(day);
			yorkie.needs.eatMeal();
			yorkie.heal(2.0F);
			yorkie.playSound(SoundEvents.EXPERIENCE_ORB_PICKUP, 0.5F, 1.2F);
		}
	},
	WATER("water", ModBlocks.DOG_WATER_BOWL) {
		@Override
		boolean isNeededBy(MushroomYorkieEntity yorkie, long day) {
			return yorkie.domestic.canDrinkWaterBowl(day);
		}

		@Override
		BlockPos findNearest(ServerLevel level, BlockPos origin) {
			return MushroomDomesticLocator.findNearestWaterBowl(level, origin);
		}

		@Override
		void apply(MushroomYorkieEntity yorkie, long day) {
			yorkie.domestic.recordWaterBowl(day);
			yorkie.needs.drinkWater();
			yorkie.playSound(SoundEvents.BUCKET_EMPTY, 0.35F, 1.7F);
		}
	};

	private final String debugName;
	private final Block block;

	BowlUse(String debugName, Block block) {
		this.debugName = debugName;
		this.block = block;
	}

	String debugName() {
		return this.debugName;
	}

	boolean isStillAvailable(ServerLevel level, BlockPos pos) {
		return level.getBlockState(pos).is(this.block);
	}

	void consume(ServerLevel level, MushroomYorkieEntity yorkie, BlockPos pos) {
		level.setBlockAndUpdate(pos, ModBlocks.DOG_BOWL.defaultBlockState());
		this.apply(yorkie, MushroomNightBehavior.currentDay(level));
		level.sendParticles(ParticleTypes.HEART, yorkie.getX(), yorkie.getY() + 0.5D, yorkie.getZ(), 3, 0.2D, 0.15D, 0.2D, 0.0D);
		MushroomBehaviorDebugger.debug(yorkie, "domestic_bowl_used", "domestic care: finished " + this.debugName, true);
	}

	abstract boolean isNeededBy(MushroomYorkieEntity yorkie, long day);

	abstract BlockPos findNearest(ServerLevel level, BlockPos origin);

	abstract void apply(MushroomYorkieEntity yorkie, long day);
}
