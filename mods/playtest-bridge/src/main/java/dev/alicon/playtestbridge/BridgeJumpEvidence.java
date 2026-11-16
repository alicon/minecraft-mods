package dev.alicon.playtestbridge;

/** Confirms an owned grounded launch, rather than a later rise or an outside impulse. */
final class BridgeJumpEvidence {
	static final double ORIGIN_TOLERANCE = 0.125;
	private final double originY;
	private boolean observed;

	BridgeJumpEvidence(double originY) {
		if (!Double.isFinite(originY)) throw new IllegalArgumentException("invalid native jump origin");
		this.originY = originY;
	}

	void observe(Observation frame) {
		this.observed |= frame.ownedPress && frame.groundedBefore && frame.nativeJump
				&& Double.isFinite(frame.beforeY) && Math.abs(frame.beforeY - this.originY) <= ORIGIN_TOLERANCE
				&& Double.isFinite(frame.beforeVelocityY) && frame.beforeVelocityY <= 0.01
				&& !frame.groundedAfter && frame.afterY > this.originY + 0.05
				&& Double.isFinite(frame.afterY) && Double.isFinite(frame.afterVelocityY) && frame.afterVelocityY > 0.05
				&& !frame.verticalCollision && !frame.unsafeMotion;
	}

	boolean observed() { return this.observed; }

	static boolean validStart(double serverY, double clientY, long sampledAt, long now, double velocityY) {
		long age = now - sampledAt;
		return age >= 0 && age <= 1000 && Double.isFinite(serverY) && Double.isFinite(clientY)
				&& Math.abs(serverY - clientY) <= ORIGIN_TOLERANCE && Double.isFinite(velocityY) && velocityY <= 0.01;
	}

	record Observation(boolean ownedPress, boolean groundedBefore, double beforeY, double beforeVelocityY,
			boolean nativeJump, boolean groundedAfter, double afterY, double afterVelocityY,
			boolean verticalCollision, boolean unsafeMotion) { }
}
