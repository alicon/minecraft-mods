'use strict';

const assert = require('node:assert/strict');
const VEHICLES = ['minecraft:oak_boat', 'minecraft:oak_chest_boat', 'minecraft:minecart'];

function assertVehicleOwnerState(snapshot, mode, flying) {
  const abilities = snapshot.players[0].abilities;
  if (abilities?.creative !== (mode === 'creative') || abilities?.flying !== flying) {
    const error = new Error(`Vehicle owner fixture lost ${mode}/flying=${flying}: ${JSON.stringify(abilities)}`);
    error.phase = 'setup';
    throw error;
  }
}

function assertVehicleMount(snapshot, petUuid, vehicleUuid) {
  const nearby = snapshot.players[0].nearbyEntities;
  const pet = nearby.find(e => e.uuid === petUuid);
  const vehicle = nearby.find(e => e.uuid === vehicleUuid);
  assert(pet && vehicle && VEHICLES.includes(vehicle.type), 'Original pet and vehicle must both be observable');
  // Bridge references intentionally contain id/type/name; UUIDs belong to full states.
  assert(pet.vehicle?.id === vehicle.id && pet.vehicle?.type === vehicle.type
    && vehicle.passengers?.some(e => e.id === pet.id && e.type === pet.type), 'Controlled native ride did not produce a real passenger');
  return pet;
}

function vehicleTools({ prepare, command, request, state, entity, advance, base, player, check }) {
  async function nativeItems(uuid, field) {
    const reply = await command(`data get entity ${uuid} ${field}`);
    check(reply.success && reply.feedback?.length && !reply.feedbackTruncated, 'Native vehicle possessions are unreadable');
    return reply.feedback;
  }
  async function frozenStep(ticks) {
    const before = (await state()).tickCount;
    await command(`tick step ${ticks}t`);
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const snapshot = await state();
      if (snapshot.tickCount >= before + ticks) return snapshot;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error('Vehicle fixture did not complete its frozen tick step');
  }
  async function prepareVehicle(inputs, options = {}) {
    await prepare(inputs);
    await command('tick freeze');
    await request('/command', { command: `clear ${player} mushroom_yorkie:yorkie_harness` }, true);
    const initial = await state();
    const pet = entity(initial);
    const harness = await request('/use-entity', { type: pet.type, radius: 8, item: 'mushroom_yorkie:yorkie_harness', count: 1 });
    check(harness.target.custom.harness, 'Vehicle fixture did not equip its harness');
    await command(`item replace entity ${pet.uuid} weapon.mainhand with minecraft:amethyst_shard[minecraft:custom_name='"Vehicle keepsake"'] 2`);
    let spawn = { x: base.x + 0.5, y: base.y + 0.1, z: base.z + 0.5 };
    if (inputs.vehicle === 'minecraft:minecart') await command(`setblock ${base.x} ${base.y} ${base.z} minecraft:rail[shape=east_west]`);
    const geometry = options.build ? await options.build(pet) : null;
    spawn = geometry?.spawn || spawn;
    await command(`summon ${inputs.vehicle} ${spawn.x} ${spawn.y} ${spawn.z} {Tags:["matrix_vehicle"],Invulnerable:1b}`);
    const vehicle = (await state()).players[0].nearbyEntities.find(e => e.type === inputs.vehicle);
    check(vehicle, 'Native vehicle summon is not observable');
    if (inputs.vehicle === 'minecraft:oak_chest_boat') {
      await command(`item replace entity ${vehicle.uuid} container.0 with minecraft:diamond[minecraft:custom_name='"Boat cargo"'] 3`);
    }
    await command(`ride ${pet.uuid} mount ${vehicle.uuid}`);
    const mounted = options.settleTicks === 0 ? await state() : await frozenStep(options.settleTicks || 2);
    const passenger = assertVehicleMount(mounted, pet.uuid, vehicle.uuid);
    check(passenger.tameable.orderedToSit === inputs.sitting, 'Mount fixture changed the sit order');
    const equipment = await nativeItems(pet.uuid, 'equipment');
    const cargo = inputs.vehicle === 'minecraft:oak_chest_boat' ? await nativeItems(vehicle.uuid, 'Items') : null;
    check(JSON.stringify(equipment).includes('Vehicle keepsake'), 'Named pet equipment was not established');
    if (cargo) check(JSON.stringify(cargo).includes('Boat cargo'), 'Named chest-boat cargo was not established');
    return { initial, mounted, petUuid: pet.uuid, vehicleUuid: vehicle.uuid, vehicleId: vehicle.id, equipment, cargo, geometry, mountingMethod: 'native-ride-command' };
  }
  async function enableFlight(trace, save, point = { x: base.x - 1.5, y: base.y + 2, z: base.z + 0.5 }) {
    // A grounded client can send flying=false after the bridge's acknowledgement.
    // Move first, then require stable replicated flight before ticking the pet.
    await command(`tp ${player} ${point.x} ${point.y} ${point.z}`);
    let stable = false;
    await new Promise(resolve => setTimeout(resolve, 150));
    for (let attempt = 0; attempt < 5 && !stable; attempt++) {
      const reply = await request('/player-abilities', { player, flying: true, mayfly: true });
      const immediate = await state();
      await new Promise(resolve => setTimeout(resolve, 150));
      const replicated = await state();
      trace.push({ reply, immediate, replicated });
      save();
      stable = immediate.players[0].abilities.flying && replicated.players[0].abilities.flying;
    }
    if (!stable) {
      const error = new Error('Could not establish stable client/server creative flight');
      error.phase = 'setup';
      throw error;
    }
  }
  return { nativeItems, frozenStep, prepareVehicle, enableFlight };
}

module.exports = { VEHICLES, assertVehicleMount, assertVehicleOwnerState, vehicleTools };
