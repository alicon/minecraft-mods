package dev.alicon.mushroomyorkie.entity;

import com.google.gson.JsonObject;
import net.minecraft.core.BlockPos;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.tags.FluidTags;
import net.minecraft.world.phys.Vec3;

/** Read-only post-native-tick input/state evidence; never invokes the escape controller. */
final class SurfaceSwimmingTrace {
	private SurfaceSwimmingTrace() {
	}

	static JsonObject frame(GameTestHelper helper, MushroomYorkieEntity yorkie, long seed, int sample) {
		Vec3 origin = helper.absoluteVec(Vec3.ZERO);
		JsonObject frame = new JsonObject();
		frame.addProperty("uuid", yorkie.getUUID().toString());
		frame.addProperty("seed", Long.toString(seed));
		frame.addProperty("sample", sample);
		frame.addProperty("entityTick", yorkie.tickCount);
		frame.addProperty("worldTick", Long.toString(yorkie.level().getGameTime()));
		frame.addProperty("inWater", yorkie.isInWater());
		frame.addProperty("underWater", yorkie.isUnderWater());
		frame.addProperty("eyesInWaterBlock", yorkie.level().getFluidState(BlockPos.containing(yorkie.getX(), yorkie.getEyeY(), yorkie.getZ())).is(FluidTags.WATER));
		frame.addProperty("escapeActive", yorkie.waterEscape.active());
		frame.addProperty("passenger", yorkie.isPassenger());
		frame.addProperty("ownerCreativeFlying", MushroomYorkieStateQueries.ownerIsCreativeFlying(yorkie));
		frame.addProperty("fetchFlying", yorkie.fetchFlight.flying());
		frame.addProperty("noGravity", yorkie.isNoGravity());
		frame.addProperty("onGround", yorkie.onGround());
		frame.addProperty("health", yorkie.getHealth());
		frame.addProperty("air", yorkie.getAirSupply());
		frame.addProperty("fallDistance", yorkie.fallDistance);
		frame.add("position", point(yorkie.position().subtract(origin)));
		frame.add("velocity", point(yorkie.getDeltaMovement()));
		return frame;
	}

	private static JsonObject point(Vec3 value) {
		JsonObject result = new JsonObject();
		result.addProperty("x", value.x);
		result.addProperty("y", value.y);
		result.addProperty("z", value.z);
		return result;
	}
}
