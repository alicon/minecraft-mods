'use strict';
const assert = require('node:assert/strict');
const { runCases, saveReport } = require('./scenario-runner');
const { careForSuccessfulPet, assertInspectionWorld } = require('./yorkie-post-run');
const { withBridgeLock } = require('./bridge-lock');
const { provenance } = require('./bridge-provenance');
const { checkCommandParsed } = require('./command-result');
const TYPE = 'mushroom_yorkie:mushroom_yorkie';
const SMOKE_TAG = 'runtime_smoke_yorkie';

// One legacy smoke remains a single scenario; its original step observations are checkpointed during the run.
async function runSmokeWithCare({ runSmoke, state, request, expectedSave, reportFile, metadata = {} }) {
  const initial = await state();
  const context = { state, request, expectedSave, playerUuid: initial.players?.[0]?.uuid, fixtureTag: SMOKE_TAG };
  const guard = async () => { const snapshot = await state(); assertInspectionWorld(snapshot, context); return snapshot; };
  let petUuid;
  const report = await runCases([{
    name: 'yorkie-runtime-smoke',
    setup: async () => { assertInspectionWorld(initial, context); return initial; },
    run: async (fixture, result, checkpoint) => {
      const gameplay = await runSmoke({
        beforeStep: guard,
        onStep: steps => {
          result.observed = { scenario: 'yorkie-smoke', entity: TYPE, steps: structuredClone(steps) };
          checkpoint();
        }
      });
      result.observed = structuredClone(gameplay);
      assert.equal(gameplay.ok, true, 'Runtime smoke did not report successful gameplay');
      petUuid = gameplay.inspectionPetUuid;
      return result.observed;
    }
  }], {
    reportFile, metadata: { ...metadata, scenario: 'yorkie-smoke', saveName: initial.saveName },
    capture: guard,
    afterSuccess: () => careForSuccessfulPet({ ...context, petUuid })
  });
  // Keep legacy flat steps/screenshot fields. The runner's overall verdict always wins over gameplay.ok.
  const compatible = { ...report.cases[0]?.observed, ...report };
  saveReport(reportFile, compatible);
  return compatible;
}

async function runRuntimeSmoke(baseUrl, args, runSmoke) {
  assert(/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(baseUrl), 'Runtime smoke requires a loopback bridge');
  return withBridgeLock(baseUrl, async () => {
    async function request(route, body, allowNoChange = false) {
      const response = await fetch(baseUrl + route, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
      const result = await response.json();
      checkCommandParsed(result);
      assert(response.ok && result.ok !== false && (result.success !== false || allowNoChange && result.result === 0), `${route}: ${JSON.stringify(result)}`);
      return result;
    }
    const state = () => request('/state');
    const initial = await state();
    return runSmokeWithCare({ runSmoke, state, request,
      expectedSave: args.expectedSave || process.env.PLAYTEST_WORLD,
      reportFile: args.reportFile || process.env.BRIDGE_REPORT_FILE || 'build/playtest-reports/yorkie-smoke.json',
      metadata: { provenance: provenance(initial.savePath) }
    });
  });
}

module.exports = { runSmokeWithCare, runRuntimeSmoke };
