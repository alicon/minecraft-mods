'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ClimbRouteObservation, squirrelRouteCases } = require('./yorkie-squirrel-routes');

test('native contact hop can settle before a smooth climb', () => {
  const route = new ClimbRouteObservation(20);
  for (const [x, y] of [[0, 20], [0.2, 20.6], [0.3, 21.2], [0.4, 20.6], [0.5, 22], [0.6, 23.8]]) {
    route.sample({ x, y, z: 0 });
  }
  route.assertSmooth();
});

test('eventual successful ascent does not hide a circling route', () => {
  const route = new ClimbRouteObservation(20);
  for (const [x, z] of [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]) route.sample({ x, y: 21, z });
  route.sample({ x: 0, y: 24, z: 0 });
  assert.throws(() => route.assertSmooth(), /circled/);
});

test('losing climbing height fails even without horizontal circling', () => {
  const route = new ClimbRouteObservation(20);
  for (const y of [20, 22, 20.5, 24]) route.sample({ x: 0, y, z: 0 });
  assert.throws(() => route.assertSmooth(), /dropped/);
});

test('no ascent and invalid position cannot pass route observation', () => {
  const route = new ClimbRouteObservation(20);
  route.sample({ x: 0, y: 20, z: 0 });
  assert.throws(() => route.assertSmooth(), /never began/);
  assert.throws(() => route.sample({ x: NaN, y: 20, z: 0 }), /Invalid/);
});

test('all eight live starts remain distinct and skip pet inspection care', () => {
  const cases = squirrelRouteCases({});
  assert.equal(cases.length, 8);
  assert.equal(new Set(cases.map(row => row.name)).size, 8);
  assert.equal(new Set(cases.map(row => JSON.stringify(row.inputs.squirrelOffset))).size, 8);
  assert.equal(cases[0].name, 'squirrel-clear-tree-face');
  assert(cases.every(row => row.inspectionPet === false && typeof row.cleanup === 'function'));
});
