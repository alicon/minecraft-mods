package dev.alicon.playtestbridge;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class BridgeJumpEvidenceTest {
	@Test
	void nativeStartRefusesStaleFutureMismatchedOrAlreadyRisingOrigins() {
		assertTrue(BridgeJumpEvidence.validStart(220, 220.125, 0, 1000, -0.08));
		assertFalse(BridgeJumpEvidence.validStart(220, 220, 0, 1001, -0.08));
		assertFalse(BridgeJumpEvidence.validStart(220, 220, 1001, 1000, -0.08));
		assertFalse(BridgeJumpEvidence.validStart(220, 220.126, 0, 50, -0.08));
		assertFalse(BridgeJumpEvidence.validStart(220, 220, 0, 50, 0.4));
		assertFalse(BridgeJumpEvidence.validStart(Double.NaN, 220, 0, 50, -0.08));
		assertFalse(BridgeJumpEvidence.validStart(220, 220, 0, 50, Double.NaN));
	}

	@Test
	void confirmsAnOwnedGroundedUnobstructedUpwardImpulse() {
		BridgeJumpEvidence evidence = new BridgeJumpEvidence(220);
		evidence.observe(new BridgeJumpEvidence.Observation(true, true, 220, -0.08, true, false, 220.42, 0.3332, false, false));
		assertTrue(evidence.observed());
		evidence.observe(new BridgeJumpEvidence.Observation(false, false, 221, 0, false, true, 220, -0.08, true, false));
		assertTrue(evidence.observed(), "Landing does not erase the witnessed owned launch");
	}

	@Test
	void aLaterJumpOrAnotherRiseCannotSatisfyTheOwnedLaunch() {
		for (String fault : new String[] {"released", "airborne-start", "origin-moved", "outside-impulse", "no-key", "still-grounded", "no-rise", "no-upward-velocity", "ceiling", "unsafe", "unknown-position"}) {
			BridgeJumpEvidence evidence = new BridgeJumpEvidence(220);
			evidence.observe(new BridgeJumpEvidence.Observation(!fault.equals("released"), !fault.equals("airborne-start"),
					fault.equals("origin-moved") ? 221 : 220, fault.equals("outside-impulse") ? 0.4 : -0.08,
					!fault.equals("no-key"), fault.equals("still-grounded"), fault.equals("no-rise") ? 220 : fault.equals("unknown-position") ? Double.NaN : 220.42,
					fault.equals("no-upward-velocity") ? 0 : 0.3332, fault.equals("ceiling"), fault.equals("unsafe")));
			assertFalse(evidence.observed(), fault);
		}
	}
}
