'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { perchVerdict, runSquirrelRestart } = require('./yorkie-squirrel-restart');

const original = { uuid: 'original', health: 8, position: { x: 3.81, y: 4.9, z: 4.5 } };
const good = () => ({ squirrel: { ...original, noGravity: true, custom: { foundTree: true } } });

test('the original healthy perch can remain stable through the restart observation', () => {
  assert.equal(perchVerdict(original, Array.from({ length: 121 }, good)).ok, true);
});

test('an eventual regained perch does not hide an earlier full-height fall', () => {
  const frames = Array.from({ length: 121 }, good);
  frames[3] = { squirrel: { ...good().squirrel, position: { ...original.position, y: 1 } } };
  const verdict = perchVerdict(original, frames);
  assert.equal(verdict.ok, false);
  assert(verdict.heightLoss > 3.8);
});

test('a different recovered face exposes a missed startup fall even at the original height', () => {
  const frames = Array.from({ length: 121 }, () => ({ squirrel: { ...good().squirrel,
    position: { x: 4.5, y: 4.9, z: 3.81 } } }));
  assert.equal(perchVerdict(original, frames).ok, false);
});

test('damage, unexpected healing, identity changes and incomplete settling cannot pass', () => {
  for (const health of [7, 9, Infinity]) {
    const frames = Array.from({ length: 121 }, good);
    frames[1] = { squirrel: { ...good().squirrel, health } };
    assert.equal(perchVerdict(original, frames).ok, false);
  }
  const frames = Array.from({ length: 121 }, good);
  frames[10] = { squirrel: { ...good().squirrel, uuid: 'replacement' } };
  assert.throws(() => perchVerdict(original, frames), /Original saved squirrel/);
  assert.throws(() => perchVerdict(original, [good()]), /incomplete/);
  assert.equal(perchVerdict(original, Array.from({ length: 121 }, () => ({ squirrel: { ...good().squirrel, noGravity: false } }))).ok, false);
});

test('wrong save and missing player identity preserve preflight failures without any mutation', async () => {
  const expected = 'Mushroom Abel Noelle Unit Fixture';
  for (const snapshot of [
    { ok: true, saveName: 'Family', singleplayer: true, players: [{ uuid: '494f67d1-2009-4c26-bfcb-c41a89adaf80', dimension: 'minecraft:overworld' }] },
    { ok: true, saveName: expected, singleplayer: true, players: [{ dimension: 'minecraft:overworld' }] }
  ]) {
    const calls = [];
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'squirrel-restart-'));
    const reportFile = path.join(directory, 'report.json');
    const server = http.createServer((request, response) => {
      calls.push(`${request.method} ${request.url}`); response.setHeader('content-type', 'application/json'); response.end(JSON.stringify(snapshot));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      await assert.rejects(runSquirrelRestart(`http://127.0.0.1:${server.address().port}`, { expectedSave: expected, reportFile }));
      assert.deepEqual(calls, ['GET /state']);
      const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
      assert.equal(report.failedStage, 'preflight');
      assert.equal(report.ok, false); assert.equal(report.complete, true); assert(report.error);
    } finally {
      await new Promise(resolve => server.close(resolve)); fs.rmSync(directory, { recursive: true });
    }
  }
});
