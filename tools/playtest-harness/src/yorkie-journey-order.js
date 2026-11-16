'use strict';

const assert = require('node:assert/strict');
const { elapsedWorldTicks } = require('./yorkie-clock');

// Wet safety precedes flight ejection in native AI order. A newly wet ejection
// frame may retain sit; the next witnessed world tick must have released it.
function advanceJourneyOrder(previous, { orderedToSit, mounted, wet, afterDismount, clock }) {
  const next = { ...previous };
  if (clock !== undefined) elapsedWorldTicks(clock, clock);
  let grace = false;
  if (afterDismount && !mounted && (wet || next.firstWetClock !== undefined)) {
    if (next.firstWetClock === undefined && wet) {
      elapsedWorldTicks(clock, clock);
      next.firstWetClock = clock;
      next.allowInitialTransition = previous.lastClock !== undefined
        && elapsedWorldTicks(previous.lastClock, clock) <= 1
        && (previous.lastMounted || !previous.lastWet);
    }
    if (next.firstWetClock !== undefined) {
      next.expectedSit = false;
      grace = next.allowInitialTransition && elapsedWorldTicks(next.firstWetClock, clock) === 0;
    }
  }
  assert(orderedToSit === next.expectedSit || (grace && orderedToSit === next.originalSit),
    'Journey changed the sit/follow order without the expected wet-dismount transition');
  return { ...next, lastClock: clock, lastMounted: mounted, lastWet: wet };
}

module.exports = { advanceJourneyOrder };
