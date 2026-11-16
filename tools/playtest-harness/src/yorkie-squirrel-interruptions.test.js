'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { squirrelInterruptionCases } = require('./yorkie-squirrel-interruptions');
const { runCases } = require('./scenario-runner');

function fixture({ stalled = false, wrongFace = false, hurt = false, neverClimbs = false } = {}) {
  let clock = 0, frozen = false;
  const walls = [];
  const context = {
    base: { x: 0, y: 20, z: 0 }, prepare: async () => {}, request: async () => ({}),
    check: (value, message) => assert(value, message),
    command: async text => {
      if (text === 'tick freeze') frozen = true;
      if (text === 'tick unfreeze') frozen = false;
      if (text === 'tick step 1t') clock++;
      if (text.startsWith('setblock ')) walls.push({ text, clock });
      return { success: true, callbackSeen: true, result: clock };
    },
    state: async () => {
      const recovered = clock >= 2 && !stalled && !neverClimbs;
      return { worldFrozen: frozen, players: [{ nearbyEntities: [{
        type: 'mushroom_yorkie:squirrel', uuid: 'original', health: hurt && clock >= 2 ? 7 : 8, maxHealth: 8,
        position: { x: wrongFace ? 3.1 : 2.81, y: neverClimbs ? 20 : recovered ? 23.8 : clock ? 20.85 : 20, z: 3.5 },
        noGravity: recovered, custom: { foundTree: recovered }
      }] }] };
    }
  };
  return { context, walls, frozen: () => frozen };
}

test('changed climbing face waits for safe native ascent and 40 recovered ticks', async () => {
  const f = fixture();
  const report = await runCases([squirrelInterruptionCases(f.context)[1]], {});
  assert.equal(report.cases[0].status, 'passed');
  assert.deepEqual(f.walls, [{ text: 'setblock 2 22 3 minecraft:stone', clock: 1 }]);
  assert.equal(report.cases[0].observed.trace.length, 41);
  assert.equal(report.cases[0].observed.interruptedAt, 1);
  assert.equal(f.frozen(), false);
});

test('a stalled climb preserves all bounded observations and unfreezes on failure', async () => {
  const f = fixture({ stalled: true });
  const report = await runCases([squirrelInterruptionCases(f.context)[1]], {});
  assert.equal(report.cases[0].status, 'failed');
  assert.match(report.cases[0].error, /failed to recover/);
  assert.equal(report.cases[0].observed.trace.length, 300);
  assert.equal(f.walls.length, 1);
  assert.equal(f.frozen(), false);
});

test('wrong face is invalid setup and cannot place the interruption block', async () => {
  const f = fixture({ wrongFace: true });
  const report = await runCases([squirrelInterruptionCases(f.context)[1]], {});
  assert.equal(report.cases[0].status, 'setup_failed');
  assert.equal(f.walls.length, 0);
  assert.equal(f.frozen(), false);
});

test('a missing native ascent is setup failure rather than gameplay failure', async () => {
  const f = fixture({ neverClimbs: true });
  const report = await runCases([squirrelInterruptionCases(f.context)[1]], {});
  assert.equal(report.cases[0].status, 'setup_failed');
  assert.equal(f.walls.length, 0);
  assert.equal(f.frozen(), false);
});

test('interruption damage cannot be hidden by a later perch', async () => {
  const f = fixture({ hurt: true });
  const report = await runCases([squirrelInterruptionCases(f.context)[1]], {});
  assert.equal(report.cases[0].status, 'failed');
  assert.match(report.cases[0].error, /damaged the original/);
  assert.equal(report.cases[0].observed.trace.length, 2);
  assert.equal(f.frozen(), false);
});
