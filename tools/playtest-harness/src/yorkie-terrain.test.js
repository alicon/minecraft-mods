'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { terrainInputs, terrainCases } = require('./yorkie-terrain');

test('terrain suite covers all toys, layouts and three independent owner locomotion states', () => {
  const rows = terrainInputs();
  assert.equal(rows.length, 36);
  assert.equal(new Set(rows.map(JSON.stringify)).size, 36);
  const cases = terrainCases({});
  assert.equal(new Set(cases.map((row) => row.name)).size, 36);
  for (const item of new Set(rows.map((row) => row.item))) {
    assert.equal(rows.filter((row) => row.item === item).length, 12);
  }
  assert.equal(rows.filter((row) => row.layout === 'covered-water' && row.expected === 'refused').length, 9);
  assert.equal(rows.filter((row) => row.layout === 'cliff' && row.ownerMode === 'survival' && row.expected === 'refused').length, 3);
  assert.equal(rows.filter((row) => row.layout === 'cliff' && row.flying && row.expected === 'returned').length, 3);
});


test('named groups and case replays cannot silently run a different scenario set', () => {
  const { selectCases } = require('./yorkie-matrix');
  const groups = { base: [{ name: 'matrix-1' }], terrain: terrainCases({}) };
  assert.equal(selectCases(groups, { group: 'terrain' }).length, 36);
  assert.equal(selectCases(groups, { case: '1' })[0].name, 'matrix-1');
  assert.throws(() => selectCases(groups, { group: 'terrani' }), /Unknown matrix group/);
  assert.throws(() => selectCases(groups, { group: 'terrain', case: 'matrix-1' }), /No matching/);
});

test('flight landing transitions cover every toy before and after pickup', () => {
  const { flightTransitionCases } = require('./yorkie-flight-transitions');
  const rows = flightTransitionCases({});
  assert.equal(rows.length, 6);
  assert.equal(new Set(rows.map((row) => row.name)).size, 6);
  for (const phase of ['chase', 'carrying']) assert.equal(rows.filter((row) => row.inputs.landingPhase === phase).length, 3);
});
