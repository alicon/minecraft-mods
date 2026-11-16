'use strict';

const assert = require('node:assert/strict');
const { assertInspectionWorld } = require('./yorkie-post-run');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// A failure photo is evidence of the current view, not a new scene. Even a
// same-position /tp can dismount the owner and reset native movement/ground state.
async function captureMatrixFailure(context, scenario, { delay = wait } = {}) {
  const { state, command, request, runId } = context;
  const snapshot = await state();
  assertInspectionWorld(snapshot, context);
  if (scenario.stopOnFailure) await command('tick freeze');
  await delay(300);
  const cameraState = await state();
  assertInspectionWorld(cameraState, context);
  if (scenario.stopOnFailure) assert(cameraState.worldFrozen === true, 'Investigative failure capture lost its frozen world');
  await delay(150);
  const screenshot = await request('/screenshot', { name: `yorkie-${runId}-${scenario.name}-failure.png`,
    resume: false, hideGui: false, clearChat: false });
  return { state: snapshot, cameraState, screenshot: screenshot.file,
    camera: { skipped: true, reason: 'failure_capture_preserves_owner_state_and_view' }, captureDelayMs: 450 };
}

module.exports = { captureMatrixFailure };
