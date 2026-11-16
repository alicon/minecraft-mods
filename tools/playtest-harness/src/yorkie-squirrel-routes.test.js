'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ClimbRouteObservation, squirrelRouteCases } = require('./yorkie-squirrel-routes');
const { runCases } = require('./scenario-runner');

test('native contact hop can settle before a smooth climb', () => {
  const route = new ClimbRouteObservation(20);
  for (const [x, y] of [[0, 20], [0.2, 20.6], [0.3, 21.2], [0.4, 20.6], [0.5, 22], [0.6, 23.8]]) {
    route.sample({ x, y, z: 0 });
  }
  route.assertSmooth(60);
});

test('eventual successful ascent does not hide a circling route', () => {
  const route = new ClimbRouteObservation(20);
  for (const [x, z] of [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]) route.sample({ x, y: 21, z });
  route.sample({ x: 0, y: 24, z: 0 });
  assert.throws(() => route.assertSmooth(60), /circled/);
});

test('losing climbing height fails even without horizontal circling', () => {
  const route = new ClimbRouteObservation(20);
  for (const y of [20, 22, 20.5, 24]) route.sample({ x: 0, y, z: 0 });
  assert.throws(() => route.assertSmooth(60), /dropped/);
});

test('no ascent and invalid position cannot pass route observation', () => {
  const route = new ClimbRouteObservation(20);
  route.sample({ x: 0, y: 20, z: 0 });
  assert.throws(() => route.assertSmooth(), /never began/);
  assert.throws(() => route.sample({ x: NaN, y: 20, z: 0 }), /Invalid/);
});

test('ground-level delay cannot be hidden by a later smooth climb', () => {
  const route = new ClimbRouteObservation(20);
  route.sample({ x: 0, y: 24, z: 0 });
  assert.throws(() => route.assertSmooth(178), /too long/);
});

test('all eight live starts remain distinct and skip pet inspection care', () => {
  const cases = squirrelRouteCases({});
  assert.equal(cases.length, 8);
  assert.equal(new Set(cases.map(row => row.name)).size, 8);
  assert.equal(new Set(cases.map(row => JSON.stringify(row.inputs.squirrelOffset))).size, 8);
  assert.equal(cases[0].name, 'squirrel-clear-tree-face');
  assert(cases.every(row => row.inspectionPet === false && typeof row.cleanup === 'function'));
});

// Synthetic transport controls verify failure handling, not squirrel physics.
for (const fault of ['health', 'missing', 'tick-skip', 'unfrozen', 'timeout', 'wrong-tree', 'none']) {
  test(`live squirrel runner preserves evidence and unfreezes after ${fault}`, async () => {
    let clock = 0, frozen = false;
    const context = {
      base: { x: 0, y: 20, z: 0 }, prepare: async () => {}, request: async () => ({}),
      check: (value, message) => assert(value, message),
      command: async text => {
        if (text === 'tick freeze') frozen = true;
        if (text === 'tick unfreeze') frozen = false;
        if (text === 'tick step 1t') clock += fault === 'tick-skip' ? 2 : 1;
        return { success: true, callbackSeen: true, result: clock };
      },
      state: async () => ({
        worldFrozen: frozen && !(fault === 'unfrozen' && clock > 0),
        players: [{ nearbyEntities: fault === 'missing' && clock > 0 ? [] : [{
          uuid: 'original', type: 'mushroom_yorkie:squirrel',
          health: fault === 'health' && clock > 0 ? 7 : 8, maxHealth: 8,
          noGravity: clock > 0 && fault !== 'timeout', custom: { foundTree: clock > 0 && fault !== 'timeout' },
          position: { x: 3.5, y: clock > 0 && fault !== 'timeout' ? 24 : 20, z: 3.5 }
        }] }]
      })
    };
    const row = squirrelRouteCases(context)[0];
    if (fault === 'wrong-tree') {
      const setup = row.setup;
      row.setup = async () => ({ ...await setup(), expectedTree: { x: 100, z: 100 } });
    }
    const report = await runCases([row], {});
    assert.equal(frozen, false);
    assert.equal(report.complete, true);
    assert.equal(report.cases[0].status, fault === 'none' ? 'passed' : 'failed');
    const observed = report.cases[0].observed;
    assert.equal(observed.fixture.uuid, 'original');
    assert.equal(observed.trace.length, fault === 'timeout' ? 400 : ['none', 'wrong-tree'].includes(fault) ? 40 : 1);
    if (fault !== 'none') assert(report.cases[0].error);
  });
}
