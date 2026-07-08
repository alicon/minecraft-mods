package dev.alicon.copsrobbers.entity;

import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;

final class PoliceCruiserPersistence {
	private static final String LIGHTS_ENABLED_TAG = "lights_enabled";
	private static final String SIREN_ENABLED_TAG = "siren_enabled";
	private static final String CAPTURED_ROBBERS_TAG = "captured_robbers";

	private PoliceCruiserPersistence() {
	}

	static void write(PoliceCruiserEntity cruiser, ValueOutput output) {
		output.putBoolean(LIGHTS_ENABLED_TAG, cruiser.lightsEnabled());
		output.putBoolean(SIREN_ENABLED_TAG, cruiser.sirenEnabled());
		output.putInt(CAPTURED_ROBBERS_TAG, cruiser.capturedRobbers());
	}

	static void read(PoliceCruiserEntity cruiser, ValueInput input) {
		cruiser.setLightsEnabled(input.getBooleanOr(LIGHTS_ENABLED_TAG, true));
		cruiser.setSirenEnabled(input.getBooleanOr(SIREN_ENABLED_TAG, false));
		cruiser.setCapturedRobbers(input.getIntOr(CAPTURED_ROBBERS_TAG, 0));
	}
}
