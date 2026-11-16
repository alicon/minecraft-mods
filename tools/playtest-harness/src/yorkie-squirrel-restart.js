'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { runMatrix } = require('./yorkie-matrix');
const { saveReport } = require('./scenario-runner');
const { withBridgeLock } = require('./bridge-lock');
const { assertInspectionWorld } = require('./yorkie-post-run');
const { advanceWorldTicks } = require('./yorkie-clock');
const { restartSavedClient } = require('./saved-client-restart');

function perchVerdict(original, frames) {
  assert(frames.length >= 40, 'Restart observation is incomplete');
  const actors = frames.map(frame => frame.squirrel);
  assert(actors.every(e => e?.uuid === original.uuid && e.health > 0), 'Original saved squirrel is missing or dead');
  const minimumHealth = Math.min(...actors.map(e => e.health));
  const heightLoss = original.position.y - Math.min(...actors.map(e => e.position.y));
  const largestHorizontalMove = Math.max(...actors.map(e => Math.hypot(e.position.x - original.position.x, e.position.z - original.position.z)));
  const settled = actors.slice(-40).every(e => e.custom?.foundTree && e.noGravity);
  const healthUnchanged = actors.every(e => e.health === original.health);
  return { minimumHealth, heightLoss, largestHorizontalMove, settled, healthUnchanged,
    ok: healthUnchanged && heightLoss <= 0.2 && largestHorizontalMove <= 0.2 && settled };
}

async function runSquirrelRestart(baseUrl, args) {
  assert(/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(baseUrl), 'Restart requires a loopback bridge');
  assert(args.lowerFaceBlock === undefined || typeof args.lowerFaceBlock === 'boolean', 'Lower-face option must be a boolean');
  const reportFile = path.resolve(args.reportFile || `build/playtest-reports/squirrel-restart-${Date.now()}-${randomUUID().slice(0, 8)}.json`);
  const report = { scenario: 'squirrel-saved-restart', expectedSave: args.expectedSave, lowerFaceBlock: args.lowerFaceBlock === true,
    stage: 'preflight', complete: false, ok: false, preRestart: [], postRestart: [] };
  const save = () => saveReport(reportFile, report); save();
  async function request(route, body) {
    const response = await fetch(baseUrl + route, { method: body ? 'POST' : 'GET', headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
    const result = await response.json();
    require('./command-result').checkCommandParsed(result);
    assert(response.ok && result.ok !== false, `Restart bridge request failed: ${route}`);
    return result;
  }
  const command = text => request('/command', { command: text });
  const identity = { expectedSave: args.expectedSave, playerUuid: undefined };
  async function state() {
    const snapshot = await request('/state');
    if (!identity.playerUuid) {
      assert.match(snapshot.players?.[0]?.uuid || '', /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i, 'Missing original player UUID');
      identity.playerUuid = snapshot.players[0].uuid;
    }
    assertInspectionWorld(snapshot, identity);
    return snapshot;
  }
  try {
    report.preflight = await state(); report.stage = 'fixture'; save();
    const fixture = await runMatrix(baseUrl, { expectedSave: args.expectedSave, group: 'transitions',
      case: 'squirrel-climbing-face-open-control', reportFile: reportFile + '.fixture.json' });
    report.fixtureReport = reportFile + '.fixture.json'; save();
    assert(fixture.ok && fixture.complete, 'Native climb fixture failed before restart');
    return await withBridgeLock(baseUrl, async () => {
      try {
        report.stage = 'verify-perch';
        const initial = await state();
        const uuid = fixture.cases[0].observed.fixture.uuid;
        const actor = snapshot => snapshot.players[0].nearbyEntities.find(e => e.uuid === uuid);
        const original = actor(initial);
        assert(original?.health === original?.maxHealth && original?.health > 0 && original.custom?.foundTree && original.noGravity, 'Fresh healthy perch is missing');
        const tree = { x: fixture.base.x + 3, y: fixture.base.y, z: fixture.base.z + 3 };
        assert(Math.abs(original.position.x - tree.x + 0.19) < 0.03 && Math.abs(original.position.z - tree.z - 0.5) < 0.03, 'Fixture did not use the authored west face');
        report.initial = initial; report.uuid = uuid; report.tree = tree; save();
        await command('tick freeze');
        assert((await state()).worldFrozen === true, 'Restart fixture did not freeze');
        for (let y = tree.y; y <= tree.y + 4; y++) {
          assert.equal((await request('/block', { x: tree.x, y, z: tree.z })).block, 'minecraft:oak_log', 'Saved perch trunk changed');
        }
        if (report.lowerFaceBlock) {
          const block = { x: tree.x - 1, y: tree.y + 2, z: tree.z };
          assert(original.position.y > block.y + 1.05, 'Lower block would overlap the squirrel');
          assert.equal((await command(`setblock ${block.x} ${block.y} ${block.z} minecraft:stone`)).success, true, 'Lower block was not placed');
          assert.equal((await request('/block', block)).block, 'minecraft:stone');
          report.placedBlock = block; save();
        }
        report.stage = 'pre-restart-control'; save();
        for (let tick = 1; tick <= 40; tick++) {
          const snapshot = await advanceWorldTicks(command, state, 1, 'step');
          assert(snapshot.worldFrozen && snapshot.tickAudit.elapsedTicks === 1, 'Restart control lost exact native ticks');
          report.preRestart.push({ tick, squirrel: actor(snapshot), tickAudit: snapshot.tickAudit }); save();
        }
        assert(perchVerdict(original, report.preRestart).ok, 'Perch changed before any saved restart');
        report.beforeQuit = await state();
        await command('tick unfreeze');
        await restartSavedClient({ request, state, expectedSave: args.expectedSave, instanceId: args.instanceId, reportFile, report, save });
        // Startup is observed once the bridge reconnects; only the following frozen ticks have a per-tick audit.
        report.postRestart.push({ tick: null, squirrel: actor(report.firstAfterRestart), phase: 'first-reconnected-snapshot' }); save();
        await command('tick freeze'); report.stage = 'observe-reloaded-perch'; save();
        for (let tick = 0; tick <= 120; tick++) {
          const snapshot = tick ? await advanceWorldTicks(command, state, 1, 'step') : await state();
          assert(snapshot.worldFrozen && (!tick || snapshot.tickAudit.elapsedTicks === 1), 'Reload observation lost exact native ticks');
          report.postRestart.push({ tick, squirrel: actor(snapshot), tickAudit: snapshot.tickAudit }); save();
          assert(actor(snapshot)?.health > 0, 'Original squirrel died or vanished after reload');
        }
        Object.assign(report, perchVerdict(original, report.postRestart));
        report.gameplayOk = report.ok;
        report.complete = true; report.stage = 'complete'; save();
        return report;
      } finally {
        // Identity is rechecked before cleanup, including failed bootstrap/wrong-world paths.
        try {
          await state(); await command('tick unfreeze');
          assert.equal((await state()).worldFrozen, false, 'Restart cleanup did not unfreeze the world');
          report.cleanup = 'unfrozen'; save();
        } catch (error) { report.cleanupError = error.message; report.ok = false; save(); }
      }
    });
  } catch (error) {
    report.failedStage = report.stage; report.error = error.message; report.complete = true; report.ok = false; save();
    throw error;
  }
}

module.exports = { runSquirrelRestart, perchVerdict };
