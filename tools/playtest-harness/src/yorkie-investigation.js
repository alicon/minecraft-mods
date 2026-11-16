'use strict';

const assert = require('node:assert/strict');

function investigationEnabled(value) {
  assert(value === undefined || typeof value === 'boolean', '--investigate is a boolean flag; omit it for an ordinary run');
  return value === true;
}

// Matrix cleanups change the fixture/world ticks. Key and resource release must
// remain in the action's own finally, which runs before a failure reaches here.
function investigateCases(cases, enabled) {
  if (!investigationEnabled(enabled)) return { cases, metadata: {} };
  return {
    cases: cases.map(scenario => ({
      ...scenario,
      stopOnFailure: true,
      cleanup: scenario.cleanup && (async result => {
        if (result.status !== 'passed') {
          result.investigativeCleanup = { status: 'skipped', reason: 'retain_failed_fixture' };
          return;
        }
        return scenario.cleanup(result);
      })
    })),
    metadata: {
      investigativeAudit: true,
      investigationPolicy: 'Stop at first failure; skip scenario fixture cleanup after setup/assertion failure. Action-owned release finally and successful cleanup remain unchanged.',
      requestedCases: cases.map(({ name, inputs }) => ({ name, inputs: structuredClone(inputs) }))
    }
  };
}

// Report I/O can throw outside normal case verdicts, even after success care
// already reset the world. Preserve that primary error and explicitly retain
// the fixture again rather than letting ordinary reset erase its context.
async function retainInterruptedInvestigation(run, retain, enabled) {
  if (!enabled) return run();
  try { return await run(); }
  catch (error) {
    try { error.investigativeWorldReset = await retain(); }
    catch (resetError) { error.worldResetError = resetError.message; }
    throw error;
  }
}

module.exports = { investigationEnabled, investigateCases, retainInterruptedInvestigation };
