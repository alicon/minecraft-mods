'use strict';

const assert = require('node:assert/strict');
const { elapsedWorldTicks } = require('./yorkie-clock');

// Wet safety precedes flight ejection in native AI order. A newly wet ejection
// frame may retain sit; the next witnessed world tick must have released it.
function advanceJourneyOrder(previous, { orderedToSit, mounted, wet, afterDismount, clock }) {
  const next = { ...previous };
  let grace = false;
  if (afterDismount && !mounted && (wet || next.firstWetClock !== undefined)) {
    if (next.firstWetClock === undefined && wet) {
      elapsedWorldTicks(clock, clock);
      next.firstWetClock = clock;
    }
    if (next.firstWetClock !== undefined) {
      next.expectedSit = false;
      grace = elapsedWorldTicks(next.firstWetClock, clock) === 0;
    }
  }
  assert(orderedToSit === next.expectedSit || (grace && orderedToSit === next.originalSit),
    'Journey changed the sit/follow order without the expected wet-dismount transition');
  return next;
}

module.exports = { advanceJourneyOrder };
