'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { advanceJourneyOrder } = require('./yorkie-journey-order');
const { GAME_TIME_MODULUS } = require('./yorkie-clock');
const sitting = () => ({ originalSit: true, expectedSit: true });

test('a water block at a dry passenger does not authorize changing its order', () => {
  assert.throws(() => advanceJourneyOrder(sitting(), { orderedToSit: false, mounted: true, wet: true, afterDismount: true, clock: 10 }));
  assert.throws(() => advanceJourneyOrder(sitting(), { orderedToSit: false, mounted: false, wet: false, afterDismount: true, clock: 10 }));
});

test('wet ejection allows the native one-frame sit transition and requires release next world tick', () => {
  for (const orderedToSit of [false, true]) {
    const original = sitting();
    const ejected = advanceJourneyOrder(original, { orderedToSit, mounted: false, wet: true, afterDismount: true, clock: 10 });
    assert.equal(original.expectedSit, true);
    assert.equal(ejected.expectedSit, false);
    assert.doesNotThrow(() => advanceJourneyOrder(ejected, { orderedToSit: false, mounted: false, wet: true, afterDismount: true, clock: 11 }));
    assert.throws(() => advanceJourneyOrder(ejected, { orderedToSit: true, mounted: false, wet: false, afterDismount: true, clock: 11 }));
  }
});

test('wet release remains required after returning dry and across the native clock wrap', () => {
  const wet = advanceJourneyOrder(sitting(), { orderedToSit: true, mounted: false, wet: true, afterDismount: true, clock: GAME_TIME_MODULUS - 1 });
  const dry = advanceJourneyOrder(wet, { orderedToSit: false, mounted: false, wet: false, afterDismount: true, clock: 0 });
  assert.equal(dry.expectedSit, false);
  assert.throws(() => advanceJourneyOrder(wet, { orderedToSit: true, mounted: false, wet: false, afterDismount: true, clock: 0 }));
});

test('a wet transition cannot be accepted without an actual native clock', () => {
  assert.throws(() => advanceJourneyOrder({ originalSit: false, expectedSit: false },
    { orderedToSit: false, mounted: false, wet: true, afterDismount: true }), /native world clock/);
});
