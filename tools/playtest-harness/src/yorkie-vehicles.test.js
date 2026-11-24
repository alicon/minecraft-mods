'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { VEHICLES, vehicleInputs, vehicleCases, assertVehicleMount, assertVehicleOwnerState } = require('./yorkie-vehicles');

test('unreachable or missing interaction distance is a setup failure before a journey action', () => {
  const { assertVehicleReach } = require('./yorkie-vehicle-fixture');
  assertVehicleReach({ distance: 3 }, 'survival');
  assertVehicleReach({ distance: 4.5 }, 'creative');
  for (const [distance, mode] of [[3.21, 'survival'], [4.51, 'creative'], [undefined, 'survival'], [NaN, 'creative']]) {
    assert.throws(() => assertVehicleReach({ distance }, mode), error => error.phase === 'setup');
  }
});

test('journey bank staging reaches a short valid boat trip without relaxing survival reach', () => {
  const { journeyOwnerPosition } = require('./yorkie-vehicle-journeys');
  const { assertVehicleReach } = require('./yorkie-vehicle-fixture');
  const base = { x: -61, y: 220, z: 106 };
  // Actual stopped audit geometry: the former bank point was 3.7 blocks away.
  const pet = { x: -58.69, y: 219.71, z: 106.5 };
  const distance = (owner, passenger) => Math.hypot(owner.x - passenger.x, owner.y - passenger.y, owner.z - passenger.z);
  assert.throws(() => assertVehicleReach({ distance: distance({ x: base.x + 6, y: base.y, z: base.z + 0.5 }, pet) }, 'survival'), e => e.phase === 'setup');
  for (const offshore of [false, true]) {
    const owner = journeyOwnerPosition({ layout: 'water', offshore }, base);
    assert.equal(Math.floor(owner.x), base.x + 4, 'Owner must stand on the audited dry doorway column');
    assert.equal(Math.floor(owner.z), base.z);
    assertVehicleReach({ distance: distance(owner, pet) }, 'survival');
    if (!offshore) {
      // Ordinary dock spawn is base.x - 0.5; two blocks east is the minimum
      // accepted travel. Check conservative passenger vertical offsets there.
      for (const y of [base.y - 0.8, base.y + 0.8])
        assertVehicleReach({ distance: distance(owner, { x: base.x + 1.5, y, z: base.z + 0.5 }) }, 'survival');
    }
    assert.throws(() => assertVehicleReach({ distance: distance(owner, { ...pet, x: base.x }) }, 'survival'), e => e.phase === 'setup');
  }
  assert.deepEqual(journeyOwnerPosition({ layout: 'rail' }, base, { position: { x: -60.2 } }), { x: -60.2, y: 220, z: 104.5 });
});

test('journey takeoff stays outside the nighttime bank doorway lintel', () => {
  const { journeyOwnerPosition } = require('./yorkie-vehicle-journeys');
  const base = { x: -61, y: 220, z: 106 };
  for (const offshore of [false, true]) {
    const ground = journeyOwnerPosition({ layout: 'water', offshore }, base);
    const flight = journeyOwnerPosition({ layout: 'water', offshore }, base, undefined, { flying: true });
    // The room's wall at x=base+4 has a solid lintel at y=base+3.
    // A standing player's width/height would overlap it above the bank point.
    assert(ground.x - 0.3 < base.x + 5 && ground.x + 0.3 > base.x + 4);
    assert(flight.y + 1.8 > base.y + 3);
    assert(flight.x - 0.3 >= base.x + 5, 'Flying player must fully clear the wall');
    assert.deepEqual(flight, { x: base.x + 6, y: base.y + 2, z: base.z + 0.5 });
  }
  assert.deepEqual(journeyOwnerPosition({ layout: 'rail' }, base, { position: { x: -60.2 } }, { flying: true }), { x: -60.2, y: 222, z: 104.5 });
});

test('lost owner flight is a fixture failure rather than a trapped-pet verdict', () => {
  const state = { players: [{ health: 20, abilities: { creative: true, flying: false } }] };
  assertVehicleOwnerState(state, 'creative', false);
  assert.throws(() => assertVehicleOwnerState(state, 'creative', true), e => e.phase === 'setup' && /fixture lost/.test(e.message));
  state.players[0].abilities.flying = true;
  assertVehicleOwnerState(state, 'creative', true);
  assert.throws(() => assertVehicleOwnerState(state, 'survival', false), e => e.phase === 'setup');
});

test('owner death or unavailable health during vehicle observation is a setup failure', () => {
  for (const health of [0, undefined, NaN]) {
    const state = { players: [{ health, abilities: { creative: false, flying: false } }] };
    assert.throws(() => assertVehicleOwnerState(state, 'survival', false),
      error => error.phase === 'setup' && /Vehicle owner fixture is dead or health is unavailable/.test(error.message));
  }
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
