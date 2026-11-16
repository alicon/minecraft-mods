'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { performance } = require('node:perf_hooks');
const { assertInspectionWorld } = require('./yorkie-post-run');
const { withBridgeLock } = require('./bridge-lock');
const { runCases } = require('./scenario-runner');
const { provenance } = require('./bridge-provenance');

// Caller owns the mutation lease. This is explicit fixture recovery, never a scenario repair.
async function respawnNativeOwner(context, { timeoutMs = 5000, pollMs = 50, onObservation = () => {} } = {}) {
  const observed = { purpose: 'explicit-fixture-recovery', snapshots: [] };
  try {
    observed.before = await context.state();
    assertInspectionWorld(observed.before, context);
    assert(observed.before.hardcore === false, 'Native respawn requires a verified non-hardcore world');
    assert(observed.before.players[0].health === 0, 'Native respawn requires a dead owner');
    onObservation(observed);
    observed.attempted = true;
    observed.acknowledgement = await context.request('/respawn', { expectedSave: context.expectedSave, playerUuid: context.playerUuid });
    onObservation(observed);
    const ack = observed.acknowledgement;
    assert(ack.ok === true && ack.accepted === true && ack.expectedSave === context.expectedSave
      && ack.playerUuid === context.playerUuid, 'Respawn acknowledgement has the wrong identity');
    const deadline = performance.now() + timeoutMs;
    do {
      const snapshot = await context.state();
      observed.snapshots.push(snapshot);
      onObservation(observed);
      assertInspectionWorld(snapshot, context);
      assert(snapshot.players[0].dimension === observed.before.players[0].dimension, 'Respawn changed the test dimension');
      assert(snapshot.hardcore === false && snapshot.players[0].abilities?.spectator === false, 'Respawn must retain a non-hardcore, non-spectator owner');
      if (Number.isFinite(snapshot.players[0].health) && snapshot.players[0].health > 0) {
        observed.after = snapshot;
        return observed;
      }
      await new Promise(resolve => setTimeout(resolve, pollMs));
    } while (performance.now() < deadline);
    throw new Error('Native respawn was not confirmed alive within the bounded wait; do not retry without checking current state');
  } catch (error) {
    error.observed = observed;
    throw error;
  }
}

async function runNativeRespawn(baseUrl, args) {
  assert(/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(baseUrl), 'Respawn requires a loopback bridge');
  assert(typeof args.playerUuid === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(args.playerUuid), 'Explicit --player-uuid is required');
  const reportFile = args.reportFile || `build/playtest-reports/native-owner-respawn-${Date.now()}.json`;
  assert(!fs.existsSync(reportFile), 'Refusing to overwrite an existing recovery report');
  return withBridgeLock(baseUrl, async () => {
    const request = async (route, body) => {
      const response = await fetch(baseUrl + route, { method: body ? 'POST' : 'GET', headers: body ? { 'content-type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10000) });
      const result = await response.json();
      assert(response.ok && result.ok !== false, `${route}: ${JSON.stringify(result)}`);
      return result;
    };
    const state = () => request('/state');
    const initial = await state();
    const context = { request, state, expectedSave: args.expectedSave, playerUuid: args.playerUuid };
    assertInspectionWorld(initial, context);
    return runCases([{ name: 'explicit-native-owner-respawn', setup: async () => initial,
      run: async (fixture, result, save) => respawnNativeOwner(context, { onObservation: observed => { result.observed = observed; save(); } })
    }], { reportFile, metadata: { purpose: 'explicit-fixture-recovery', provenance: provenance(initial.savePath) } });
  });
}

module.exports = { respawnNativeOwner, runNativeRespawn };
