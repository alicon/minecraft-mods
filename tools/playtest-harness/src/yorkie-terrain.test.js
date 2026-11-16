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

test('outdoor cases cover daily care, sit/sleep controls and warning boundaries', () => {
  const { outdoorInputs, outdoorCases } = require('./yorkie-outdoor');
  const rows = outdoorInputs();
  assert.equal(rows.length, 20);
  assert.equal(new Set(outdoorCases({}).map((row) => row.name)).size, 20);
  assert.equal(rows.filter((row) => row.potty === 100).length, 16);
  for (const potty of [81, 90]) assert.equal(rows.filter((row) => row.potty === potty).length, 2);
  for (const ownerMode of ['survival', 'creative']) assert.equal(rows.filter((row) => row.ownerMode === ownerMode).length, 10);
  assert.equal(rows.filter((row) => row.time === 18000).length, 8);
  assert.equal(rows.filter((row) => row.sitting).length, 8);
});

test('water recovery covers modes, hunger, urgent day/night needs, wet sit requests and real builder naps', () => {
  const { waterRestInputs, waterRestCases } = require('./yorkie-water-rest');
  const rows = waterRestInputs();
  assert.equal(rows.length, 22);
  assert.equal(new Set(waterRestCases({}).map((row) => row.name)).size, 22);
  assert.equal(rows.filter((row) => row.time === 18000).length, 10);
  assert.equal(rows.filter((row) => row.requestSit).length, 8);
  assert.equal(rows.filter((row) => row.ownerMode === 'survival').length, 10);
  for (const time of [1000, 18000]) assert.deepEqual(rows.filter((row) => row.time === time && row.potty === 100).map((row) => row.ownerMode), ['survival', 'creative']);
  assert.deepEqual(rows.filter((row) => row.buildNap).map((row) => row.energy), [0, 80]);
});


test('sleep spot controls cover both beds, modes and hunger levels', () => {
  const { sleepSpotInputs, sleepSpotCases } = require('./yorkie-sleep-spots');
  const rows = sleepSpotInputs();
  assert.equal(rows.length, 8);
  assert.equal(new Set(sleepSpotCases({}).map((row) => row.name)).size, 8);
  for (const spot of ['dog_bed', 'doghouse']) {
    for (const ownerMode of ['survival', 'creative']) {
      assert.deepEqual(rows.filter((row) => row.spot === spot && row.ownerMode === ownerMode).map((row) => row.hunger), [0, 90]);
    }
  }
});
