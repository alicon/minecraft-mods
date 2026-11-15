'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runCases } = require('./scenario-runner');
const { matrixInputs, assertTestWorld } = require('./yorkie-matrix');

test('continues after failures and persists evidence and complete report', async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'yorkie-tests-'));
  const reportFile = path.join(folder, 'report.json');
  try {
    let executed = false;
    const result = await runCases([
      { name: 'bad setup', setup: async () => { throw Error('missing fixture'); }, run: async () => assert.fail() },
      { name: 'behavior failure', setup: async () => {}, run: async () => { throw Error('wrong behavior'); } },
      { name: 'next case', setup: async () => {}, run: async () => { executed = true; return { alive: true }; } }
    ], { reportFile, capture: async () => ({ screenshot: 'evidence.png' }) });
    assert.equal(executed, true);
    assert.deepEqual(result.summary, { setup_failed: 1, failed: 1, passed: 1 });
    assert.equal(result.ok, false);
    assert.equal(result.complete, true);
    assert.equal(JSON.parse(fs.readFileSync(reportFile)).cases[1].evidence.screenshot, 'evidence.png');
  } finally { fs.rmSync(folder, { recursive: true }); }
});

test('records evidence and cleanup errors without hiding original failure', async () => {
  const result = await runCases([{
    name: 'failure', setup: async () => {}, run: async () => { throw Error('behavior'); },
    cleanup: async () => { throw Error('cleanup'); }
  }], { capture: async () => { throw Error('capture'); } });
  assert.equal(result.cases[0].error, 'behavior');
  assert.equal(result.cases[0].captureError, 'capture');
  assert.equal(result.cases[0].cleanupError, 'cleanup');
  assert.equal(result.ok, false);
});

test('rejects family saves, wrong identities, and multiplayer', () => {
  const save = 'Mushroom Matrix Test';
  const state = { saveName: save, singleplayer: true, players: [{}] };
  assert.doesNotThrow(() => assertTestWorld(state, save));
  assert.throws(() => assertTestWorld(state, 'different'));
  assert.throws(() => assertTestWorld(state));
  assert.throws(() => assertTestWorld({ ...state, saveName: 'Family' }, 'Family'));
  assert.throws(() => assertTestWorld({ ...state, singleplayer: false }, save));
  assert.throws(() => assertTestWorld({ ...state, players: [{}, {}] }, save));
});

test('matrix separates survival walking, creative walking, and creative flying', () => {
  const rows = matrixInputs();
  assert.equal(rows.length, 144);
  assert.equal(new Set(rows.map(JSON.stringify)).size, 144);
  assert.deepEqual([...new Set(rows.map((row) => row.shelter))].sort(), ['inside', 'outside', 'roof']);
  assert.equal(rows.filter((row) => row.ownerMode === 'survival' && !row.flying).length, 48);
  assert.equal(rows.filter((row) => row.ownerMode === 'creative' && !row.flying).length, 48);
  assert.equal(rows.filter((row) => row.ownerMode === 'creative' && row.flying).length, 48);
  assert.equal(rows.filter((row) => row.ownerMode === 'survival' && row.flying).length, 0);
});

test('HTTP-success command rejection cannot silently pass; no-op commands stay valid', () => {
  const { checkCommandParsed } = require('./command-result');
  assert.throws(() => checkCommandParsed({ ok: true, callbackSeen: false, command: 'invalid' }), /rejected command syntax/);
  assert.doesNotThrow(() => checkCommandParsed({ ok: true, callbackSeen: true, success: false, result: 0 }));
  assert.doesNotThrow(() => checkCommandParsed({ ok: true }));
});

test('matrix rejects concurrent bridge owners and releases lock after failure', async () => {
  const { withBridgeLock } = require('./bridge-lock');
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'yorkie-lock-test-'));
  try {
    await assert.rejects(withBridgeLock('http://localhost:57321', async () => {
      await assert.rejects(withBridgeLock('http://127.0.0.1:57321', async () => assert.fail(), folder), /Another scenario owns/);
      throw Error('failed run');
    }, folder), /failed run/);
    assert.equal(await withBridgeLock('http://127.0.0.1:57321', async () => 'released', folder), 'released');
  } finally { fs.rmSync(folder, { recursive: true }); }
});

test('actual bridge CLI exits unsuccessfully when Minecraft rejects command syntax', async () => {
  const http = require('node:http');
  const { promisify } = require('node:util');
  const execFile = promisify(require('node:child_process').execFile);
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: true, callbackSeen: false, command: 'bad command', feedback: ['Unknown command at position 0'] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await assert.rejects(execFile(process.execPath, [path.join(__dirname, 'bridge-cli.js'),
      'command', '--command', 'bad command', '--port', String(server.address().port)], { timeout: 5000 }),
    (error) => error.code === 1 && error.stderr.includes('Minecraft rejected command syntax') && error.stderr.includes('Unknown command at position 0'));
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('transition suite covers each fetch toy interrupted by both sit and sleep', () => {
  const { transitionCases } = require('./yorkie-transitions');
  const cases = transitionCases({});
  assert.equal(cases.length, 13);
  assert.equal(new Set(cases.map((scenario) => scenario.name)).size, 13);
  assert.equal(cases.filter((scenario) => /^fetch-(sit|sleep)-/.test(scenario.name)).length, 6);
  assert.equal(cases.filter((scenario) => scenario.name.startsWith('fetch-owner-mode-')).length, 3);
  assert.equal(cases.filter((scenario) => scenario.name.startsWith('sleep-flight-')).length, 2);
});

test('unmet live fixture preconditions stay distinct from gameplay failures', async () => {
  const result = await runCases([{
    name: 'pickup fixture', setup: async () => {}, run: async () => {
      const error = new Error('pickup was not isolated'); error.phase = 'setup'; throw error;
    }
  }], {});
  assert.equal(result.cases[0].status, 'setup_failed');
  assert.equal(result.ok, false);
});

test('quit CLI forwards the exact expected save to the guarded endpoint', async () => {
  const http = require('node:http');
  const { promisify } = require('node:util');
  const execFile = promisify(require('node:child_process').execFile);
  let observed;
  const server = http.createServer(async (req, res) => {
    let text = ''; for await (const chunk of req) text += chunk;
    observed = { path: req.url, method: req.method, body: JSON.parse(text) };
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: true, accepted: true }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const result = await execFile(process.execPath, [path.join(__dirname, 'bridge-cli.js'),
      'quit', '--expected-save', 'Codex Quit Test', '--port', String(server.address().port)], { timeout: 5000 });
    assert.equal(JSON.parse(result.stdout).accepted, true);
    assert.deepEqual(observed, { path: '/quit', method: 'POST', body: { expectedSave: 'Codex Quit Test' } });
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
