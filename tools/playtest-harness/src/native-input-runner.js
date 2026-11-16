'use strict';

const assert = require('node:assert/strict');
const { withBridgeLock } = require('./bridge-lock');
const { assertTestWorld } = require('./yorkie-world');
const { assertInspectionWorld } = require('./yorkie-post-run');
const { runCases } = require('./scenario-runner');
const { driveClientInput } = require('./client-input');
const { provenance } = require('./bridge-provenance');

async function runNativeInput(baseUrl, args) {
  assert(/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(baseUrl), 'Native input requires a loopback bridge');
  return withBridgeLock(baseUrl, async () => {
    async function request(route, body) {
      const response = await fetch(baseUrl + route, { method: body ? 'POST' : 'GET',
        headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15000) });
      const result = await response.json();
      assert(response.ok && result.ok !== false, `${route}: ${JSON.stringify(result)}`);
      return result;
    }
    const state = () => request('/state');
    const initial = await state();
    assertTestWorld(initial, args.expectedSave);
    const context = { request, state, expectedSave: args.expectedSave, playerUuid: initial.players[0].uuid };
    assertInspectionWorld(initial, context);
    const controls = { mode: args.mode, ticks: args.ticks, forward: args.forward, backward: args.backward, left: args.left, right: args.right };
    if (args.vehicleUuid) controls.vehicleUuid = args.vehicleUuid;
    const abort = new AbortController();
    const interrupt = () => abort.abort();
    process.once('SIGINT', interrupt);
    process.once('SIGTERM', interrupt);
    try {
      return await runCases([{
      name: 'native-client-input', inputs: controls, setup: async () => initial,
      run: async (fixture, result, save) => {
        try {
          return await driveClientInput(context, controls, { signal: abort.signal,
            onReceipt: observed => { result.observed = observed;save(); } });
        } catch (error) {
          if (error.observed) result.observed = error.observed;
          save();throw error;
        }
      }
    }], { reportFile: args.reportFile || process.env.BRIDGE_REPORT_FILE || 'build/playtest-reports/native-client-input.json',
      metadata: { scenario: 'native-client-input', expectedSave: args.expectedSave, provenance: provenance(initial.savePath) } });
    } finally {
      process.removeListener('SIGINT', interrupt);
      process.removeListener('SIGTERM', interrupt);
    }
  });
}

module.exports = { runNativeInput };
