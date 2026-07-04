package dev.alicon.copsrobbers.entity;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;

final class PoliceCruiserControlPolicyTest {
	private static final float FLOAT_DELTA = 0.00001F;

	@ParameterizedTest
	@CsvSource({
			"-2.50, -1.00",
			"-1.00, -1.00",
			"-0.25, -0.25",
			"0.00, 0.00",
			"0.25, 0.25",
			"1.00, 1.00",
			"2.50, 1.00"
	})
	void liftInputIsClampedToCruiserControlRange(float input, float expected) {
		assertEquals(expected, PoliceCruiserControlPolicy.liftInput(input), FLOAT_DELTA);
	}

	@Test
	void nonFiniteLiftInputBecomesNeutral() {
		assertAll(
				() -> assertEquals(0.0F, PoliceCruiserControlPolicy.liftInput(Float.NaN), FLOAT_DELTA),
				() -> assertEquals(0.0F, PoliceCruiserControlPolicy.liftInput(Float.POSITIVE_INFINITY), FLOAT_DELTA),
				() -> assertEquals(0.0F, PoliceCruiserControlPolicy.liftInput(Float.NEGATIVE_INFINITY), FLOAT_DELTA)
		);
	}

	@ParameterizedTest
	@CsvSource({
			"-1.00, -0.45",
			"-0.50, -0.225",
			"0.00, 0.00",
			"0.50, 0.50",
			"1.00, 1.00"
	})
	void reverseForwardInputIsSlowerThanForwardDrive(float input, float expected) {
		assertEquals(expected, PoliceCruiserControlPolicy.forwardInput(input), FLOAT_DELTA);
	}

	@ParameterizedTest
	@CsvSource({
			"-1.00, -0.35",
			"-0.50, -0.175",
			"0.00, 0.00",
			"0.50, 0.175",
			"1.00, 0.35"
	})
	void strafeInputIsReducedForCruiserHandling(float input, float expected) {
		assertEquals(expected, PoliceCruiserControlPolicy.strafeInput(input), FLOAT_DELTA);
	}

	@ParameterizedTest
	@CsvSource({
			"-3, 0",
			"0, 0",
			"5, 5",
			"12, 12",
			"99, 12"
	})
	void capturedRobberCountIsClamped(int input, int expected) {
		assertEquals(expected, PoliceCruiserControlPolicy.clampCapturedRobbers(input));
	}

	@ParameterizedTest
	@CsvSource({
			"-2, 1",
			"0, 1",
			"11, 12",
			"12, 12",
			"99, 12"
	})
	void captureIncrementsUntilCruiserIsFull(int current, int expected) {
		assertEquals(expected, PoliceCruiserControlPolicy.afterCapture(current));
	}

	@ParameterizedTest
	@CsvSource({
			"5, -1, 5",
			"5, 0, 5",
			"5, 2, 3",
			"5, 99, 0",
			"99, 1, 11"
	})
	void releaseRemovesPositiveCountsWithoutGoingNegative(int current, int released, int expected) {
		assertEquals(expected, PoliceCruiserControlPolicy.afterRelease(current, released));
	}
}
