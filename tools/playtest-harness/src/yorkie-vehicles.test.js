'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { VEHICLES, vehicleInputs, vehicleCases, assertVehicleMount, assertVehicleOwnerState } = require('./yorkie-vehicles');

test('lost owner flight is a fixture failure rather than a trapped-pet verdict', () => {
  const state = { players: [{ abilities: { creative: true, flying: false } }] };
  assertVehicleOwnerState(state, 'creative', false);
  assert.throws(() => assertVehicleOwnerState(state, 'creative', true), e => e.phase === 'setup' && /fixture lost/.test(e.message));
  state.players[0].abilities.flying = true;
  assertVehicleOwnerState(state, 'creative', true);
  assert.throws(() => assertVehicleOwnerState(state, 'survival', false), e => e.phase === 'setup');
});

test('vehicle scenarios independently cover passenger actions, owner modes, hunger, night and sit orders', () => {
  const rows = vehicleInputs();
  assert.equal(rows.length, 100);
  assert.equal(new Set(vehicleCases({}).map(c => c.name)).size, rows.length);
  for (const vehicle of VEHICLES)
    for (const time of [1000, 18000])
      for (const hunger of [0, 90])
        for (const sitting of [false, true]) {
          const actions = rows.filter(r => r.action !== 'reboard' && r.vehicle === vehicle && r.time === time && r.hunger === hunger && r.sitting === sitting);
          assert.deepEqual(actions.map(r => [r.action, r.ownerMode]), [
            ['assist', 'survival'], ['assist', 'creative'], ['takeoff', 'creative'], ['care', 'survival']
          ]);
        }
  assert.equal(rows.filter(r => r.action === 'reboard').length, 4);
});

test('mount evidence joins native id/type references to full UUID states in both directions', () => {
  const pet = { id: 10, uuid: 'pet', type: 'mushroom_yorkie:mushroom_yorkie', vehicle: { id: 11, type: 'minecraft:oak_boat' } };
  const vehicle = { id: 11, uuid: 'boat', type: 'minecraft:oak_boat', passengers: [{ id: 10, type: pet.type }] };
  const snapshot = { players: [{ nearbyEntities: [pet, vehicle] }] };
  assert.equal(assertVehicleMount(snapshot, 'pet', 'boat'), pet);
  for (const mutate of [
    s => { s.players[0].nearbyEntities[0].vehicle.id = 99; },
    s => { s.players[0].nearbyEntities[0].vehicle.type = 'minecraft:minecart'; },
    s => { s.players[0].nearbyEntities[1].passengers = []; },
    s => { s.players[0].nearbyEntities[1].passengers[0].type = 'minecraft:pig'; },
    s => { s.players[0].nearbyEntities.pop(); }
  ]) {
    const invalid = structuredClone(snapshot);
    mutate(invalid);
    assert.throws(() => assertVehicleMount(invalid, 'pet', 'boat'));
  }
  assert.throws(() => assertVehicleMount(snapshot, 'different-pet', 'boat'));
  assert.throws(() => assertVehicleMount(snapshot, 'pet', 'different-boat'));
});


test('journey scenarios cover real water/rail travel and each owner action across hunger, time and orders', () => {
  const { journeyInputs, journeyCases } = require('./yorkie-vehicle-journeys');
  const rows = journeyInputs();
  assert.equal(rows.length, 112);
  assert.equal(new Set(journeyCases({}).map(c => c.name)).size, rows.length);
  assert.equal(rows.filter(r => r.layout === 'water').length, 80);
  assert.equal(rows.filter(r => r.layout === 'rail').length, 32);
  assert.equal(rows.filter(r => r.offshore && r.sitting && r.action === 'assist-immersion').length, 16);
  for (const vehicle of VEHICLES)
    for (const time of [1000, 18000])
      for (const hunger of [0, 90])
        for (const sitting of [false, true]) {
          const cases = rows.filter(r => !r.offshore && r.vehicle === vehicle && r.time === time && r.hunger === hunger && r.sitting === sitting);
          assert.deepEqual(cases.map(r => [r.action, r.ownerMode]), [
            ['assist', 'survival'], ['assist', 'creative'], ['takeoff', 'creative'], ['care', 'survival']
          ]);
        }
});
