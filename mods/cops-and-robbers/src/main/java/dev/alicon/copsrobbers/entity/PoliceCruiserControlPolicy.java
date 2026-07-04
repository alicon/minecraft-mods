package dev.alicon.copsrobbers.entity;

final class PoliceCruiserControlPolicy {
	private PoliceCruiserControlPolicy() {
	}

	static float liftInput(float input) {
		if (!Float.isFinite(input)) {
			return 0.0F;
		}
		return Math.clamp(input, -1.0F, 1.0F);
	}

	static float forwardInput(float input) {
		return input < 0.0F ? input * PoliceCruiserGameplayConfig.REVERSE_MULTIPLIER : input;
	}

	static float strafeInput(float input) {
		return input * PoliceCruiserGameplayConfig.STRAFE_MULTIPLIER;
	}

	static int clampCapturedRobbers(int count) {
		return Math.max(0, Math.min(count, PoliceCruiserGameplayConfig.MAX_CAPTURED_ROBBERS));
	}

	static int afterCapture(int currentCount) {
		int current = clampCapturedRobbers(currentCount);
		if (current >= PoliceCruiserGameplayConfig.MAX_CAPTURED_ROBBERS) {
			return PoliceCruiserGameplayConfig.MAX_CAPTURED_ROBBERS;
		}
		return current + 1;
	}

	static int afterRelease(int currentCount, int releasedCount) {
		int current = clampCapturedRobbers(currentCount);
		if (releasedCount <= 0) {
			return current;
		}
		return Math.max(0, current - releasedCount);
	}
}
