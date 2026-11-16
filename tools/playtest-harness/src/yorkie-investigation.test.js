'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { investigateCases, investigationEnabled, retainInterruptedInvestigation } = require('./yorkie-investigation');
const { runCases } = require('./scenario-runner');

test('investigation is opt-in and refuses ambiguous flag values', () => {
  assert.equal(investigationEnabled(undefined), false);
  assert.equal(investigationEnabled(false), false);
  assert.equal(investigationEnabled(true), true);
  for (const value of ['false', 'true', 1, null]) assert.throws(() => investigationEnabled(value), /boolean flag/);
  const cases = [{ name: 'ordinary', inputs: { hunger: 0 } }];
  const ordinary = investigateCases(cases, false);
  assert.equal(ordinary.cases, cases);
  assert.deepEqual(ordinary.metadata, {});
  const investigation = investigateCases(cases, true);
  assert.equal(cases[0].stopOnFailure, undefined);
  assert.equal(investigation.cases[0].stopOnFailure, true);
  cases[0].inputs.hunger = 90;
  assert.equal(investigation.metadata.requestedCases[0].inputs.hunger, 0);
});

test('investigation retains setup/assertion failures, releases action keys and skips replacement/care', async () => {
  for (const phase of ['setup', 'assertion']) {
    const events = [];
    const cases = [
      { name: 'passed', inputs: { id: 1 }, setup: async () => {}, run: async () => 'passed',
        cleanup: async function (result) { assert.equal(this.name, 'passed');events.push(`cleanup:${result.status}`); } },
      { name: 'anomaly', inputs: { id: 2 },
        setup: async () => { if (phase === 'setup') throw Error('original setup'); },
        run: async () => { try { throw Error('original behavior'); } finally { events.push('action keys released'); } },
        cleanup: async () => { events.push('fixture replaced or unfrozen'); } },
      { name: 'unexecuted', inputs: { id: 3 }, setup: async () => { events.push('replacement'); }, run: async () => {} }
    ];
    const plan = investigateCases(cases, true);
    const report = await runCases(plan.cases, { metadata: plan.metadata,
      capture: async scenario => { events.push('freeze and capture');return { original: scenario.name }; },
      afterSuccess: async () => { events.push('care'); } });
    assert.deepEqual(events, ['cleanup:passed', ...(phase === 'assertion' ? ['action keys released'] : []), 'freeze and capture']);
    assert.deepEqual(report.requestedCases.map(c => c.name), ['passed', 'anomaly', 'unexecuted']);
    assert.equal(report.cases.length, 2);assert.equal(report.requestedCaseCount, 3);
    assert.equal(report.complete, true);assert.equal(report.gameplayComplete, false);assert.equal(report.ok, false);
    assert.equal(report.stoppedAfterFailure, true);assert.equal(report.postRun.status, 'skipped');
    assert.equal(report.cases[1].status, phase === 'setup' ? 'setup_failed' : 'failed');
    assert.equal(report.cases[1].evidence.original, 'anomaly');
    assert.deepEqual(report.cases[1].investigativeCleanup, { status: 'skipped', reason: 'retain_failed_fixture' });
  }
});

test('capture and cleanup errors remain failures; last-case failure cannot become a pass', async () => {
  for (const fault of ['capture', 'cleanup', 'last']) {
    let replaced = false, cared = false;
    const cases = [{ name: 'failure', setup: async () => {},
      run: async () => { if (fault !== 'cleanup') throw Error('original anomaly'); },
      cleanup: async () => { if (fault === 'cleanup') throw Error('cleanup failure');else assert.fail('Failed body cleanup must be skipped'); } }];
    if (fault !== 'last') cases.push({ name: 'replacement', setup: async () => { replaced = true; }, run: async () => {} });
    const plan = investigateCases(cases, true);
    const report = await runCases(plan.cases, { metadata: plan.metadata,
      capture: async () => { if (fault === 'capture') throw Error('screenshot failed'); },
      afterSuccess: async () => { cared = true; } });
    assert.equal(replaced, false);assert.equal(cared, false);assert.equal(report.ok, false);
    assert.equal(report.complete, true);assert.equal(report.gameplayComplete, fault === 'last');
    assert.equal(report.cases[0].status, fault === 'cleanup' ? 'cleanup_failed' : 'failed');
    if (fault === 'capture') { assert.equal(report.cases[0].error, 'original anomaly');assert.equal(report.cases[0].captureError, 'screenshot failed'); }
    if (fault === 'cleanup') assert.equal(report.cases[0].cleanupError, 'cleanup failure');
  }
});

test('successful investigation preserves fixture cleanup and separate success care', async () => {
  const events = [];
  const plan = investigateCases([{ name: 'success', setup: async () => 'fixture',
    run: async fixture => { assert.equal(fixture, 'fixture');events.push('gameplay');return { health: 12 }; },
    cleanup: async () => { events.push('cleanup'); } }], true);
  const report = await runCases(plan.cases, { metadata: plan.metadata, afterSuccess: async () => { events.push('care');return { fed: true }; } });
  assert.deepEqual(events, ['gameplay', 'cleanup', 'care']);
  assert.equal(report.ok, true);assert.equal(report.gameplayComplete, true);assert.equal(report.postRun.status, 'passed');
  assert.equal(report.cases[0].investigativeCleanup, undefined);
});

test('runner interruption retains the original error and freezes even after a prior success reset', async () => {
  const { withWorldReset } = require('./yorkie-post-run');
  for (const enabled of [false, true]) {
    const events = [], original = Error('report writer failed');
    let interrupted = false;
    await assert.rejects(withWorldReset({
      run: reset => retainInterruptedInvestigation(async () => { await reset();throw original; },
        () => { interrupted = true;return reset(); }, enabled),
      reset: async () => { events.push(interrupted ? 'freeze' : 'ordinary reset');return { worldFrozen: interrupted }; }
    }), error => error === original);
    assert.deepEqual(events, enabled ? ['ordinary reset', 'freeze'] : ['ordinary reset']);
    assert.equal(original.investigativeWorldReset?.worldFrozen, enabled ? true : undefined);
  }
  const original = Error('original runner failure');
  await assert.rejects(retainInterruptedInvestigation(async () => { throw original; },
    async () => { throw Error('identity changed; cannot freeze'); }, true), error => error === original);
  assert.equal(original.worldResetError, 'identity changed; cannot freeze');
  assert.equal(original.investigativeWorldReset, undefined);
});

test('real matrix CLI forwards investigate, retains failures and rejects ambiguous values before requests', async () => {
  const http = require('node:http'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
  const execFile = require('node:util').promisify(require('node:child_process').execFile);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-investigate-'));
  const expectedSave = 'Codex Investigation Fixture';
  let frozen = false, captureFails = false;
  const requests = [];
  const server = http.createServer(async (req, res) => {
    let text = '';for await (const chunk of req) text += chunk;
    const body = text ? JSON.parse(text) : undefined;requests.push({ route: req.url, body });
    let reply = { ok: true, success: true, result: 1 };
    if (req.url === '/state') reply = { saveName: expectedSave, savePath: directory, singleplayer: true, worldFrozen: frozen,
      players: [{ name: 'owner', uuid: 'original-owner', health: 20, dimension: 'minecraft:overworld', position: { x: 0, y: 220, z: 0 } }] };
    if (req.url === '/command' && body.command === 'tick sprint stop') reply = { ok: false, error: 'deliberate setup refusal' };
    if (req.url === '/command' && body.command === 'tick freeze') frozen = true;
    if (req.url === '/screenshot') {
      reply = { ok: true, file: 'fixture.png' };
      if (captureFails && body.resume === false) reply = { ok: false, error: 'deliberate screenshot failure' };
    }
    res.setHeader('content-type', 'application/json');res.end(JSON.stringify(reply));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const args = [path.join(__dirname, 'bridge-cli.js'), 'yorkie-matrix', '--expected-save', expectedSave,
    '--port', String(server.address().port), '--group', 'journeys'];
  try {
    await assert.rejects(execFile(process.execPath, [...args, '--investigate=false'], { timeout: 5000 }), /boolean flag/);
    assert.equal(requests.length, 0);
    await assert.rejects(execFile(process.execPath, [args[0], 'health', '--investigate', '--port', String(server.address().port)], { timeout: 5000 }), /only supported by yorkie-matrix/);
    assert.equal(requests.length, 0);
    for (const failScreenshot of [false, true]) {
      frozen = false;captureFails = failScreenshot;requests.length = 0;
      const file = path.join(directory, `report-${failScreenshot}.json`);
      await assert.rejects(execFile(process.execPath, [...args, '--investigate', '--report-file', file], { timeout: 10000 }), error => error.code === 1);
      const report = JSON.parse(fs.readFileSync(file));
      assert.equal(report.investigativeAudit, true);assert.equal(report.requestedCases.length, 112);
      assert.equal(report.requestedCaseCount, 112);assert.equal(report.cases.length, 1);
      assert.equal(report.complete, true);assert.equal(report.gameplayComplete, false);assert.equal(report.ok, false);
      assert.equal(report.cases[0].status, 'setup_failed');assert.equal(report.stoppedAfterFailure, true);
      assert.equal(report.cases[0].investigativeCleanup.status, 'skipped');
      assert.equal(Boolean(report.cases[0].captureError), failScreenshot);
      assert.deepEqual(report.worldReset, { status: 'skipped', reason: 'investigative_failure_fixture_retained', worldFrozen: true });
      const commands = requests.filter(r => r.route === '/command').map(r => r.body.command);
      assert.equal(commands.filter(c => c === 'tick sprint stop').length, 1);
      assert.equal(commands.filter(c => c === 'tick freeze').length, 2);
      assert(!commands.some(c => c === 'tick unfreeze' || c.startsWith('gamemode ') || c === 'time set day'));
      assert(!requests.some(r => r.route === '/clear-entities'));
    }
    frozen = false;requests.length = 0;
    // An existing directory makes the real atomic report rename throw before
    // a case can start. Retention must not depend on having a returned report.
    const unusableReport = path.join(directory, 'unusable-report.json');fs.mkdirSync(unusableReport);
    await assert.rejects(execFile(process.execPath, [...args, '--investigate', '--report-file', unusableReport], { timeout: 10000 }),
      error => error.code === 1 && /retained frozen after runner interruption/.test(error.stderr));
    assert.equal(frozen, true);
    const crashCommands = requests.filter(r => r.route === '/command').map(r => r.body.command);
    assert.equal(crashCommands.filter(c => c === 'tick freeze').length, 1);
    assert(!crashCommands.some(c => c === 'tick unfreeze' || c.startsWith('gamemode ') || c === 'time set day' || c === 'tick sprint stop'));
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(directory, { recursive: true });
  }
});
