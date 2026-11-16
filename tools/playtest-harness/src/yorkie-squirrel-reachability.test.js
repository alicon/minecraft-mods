'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { squirrelReachabilityCases } = require('./yorkie-squirrel-reachability');
const { runCases } = require('./scenario-runner');

test('reachability cases retain blocked, open, farther-only, dynamic and other-face controls', () => {
  const rows = squirrelReachabilityCases({});
  assert.deepEqual(rows.map(row => row.inputs.treeLayout), ['enclosed', 'open', 'far-only', 'close-later', 'blocked-face']);
  assert.equal(new Set(rows.map(row => row.name)).size, 5);
  assert(rows.every(row => row.inspectionPet === false && typeof row.cleanup === 'function'));
});

test('invalid route-closure staging is a setup failure with evidence and no new wall', async () => {
  let clock = 0, frozen = false, wallCommands = 0;
  const context = {
    base: { x: 0, y: 20, z: 0 }, prepare: async () => {}, request: async () => ({}),
    check: (value, message) => assert(value, message),
    command: async text => {
      if (text === 'tick freeze') frozen = true;
      if (text === 'tick unfreeze') frozen = false;
      if (text === 'tick step 1t') clock++;
      if (text.endsWith(' minecraft:stone')) wallCommands++;
      return { success: true, callbackSeen: true, result: clock };
    },
    state: async () => ({ worldFrozen: frozen, players: [{ nearbyEntities: [{
      type: 'mushroom_yorkie:squirrel', uuid: 'original', health: 8, maxHealth: 8,
      position: { x: -0.5, y: 20, z: 3.5 }, noGravity: false, custom: { foundTree: false }
    }] }] })
  };
  const row = squirrelReachabilityCases(context).find(candidate => candidate.inputs.treeLayout === 'close-later');
  const report = await runCases([row], {});
  assert.equal(report.cases[0].status, 'setup_failed');
  assert.match(report.cases[0].error, /unobstructed native ground approach/);
  assert.equal(report.cases[0].observed.trace.length, 4);
  assert.equal(wallCommands, 0);
  assert.equal(frozen, false);
});
