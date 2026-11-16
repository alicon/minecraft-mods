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

function vehicleInputs() {
  const rows = [];
  for (const vehicle of VEHICLES)
    for (const time of [1000, 18000])
      for (const hunger of [0, 90])
        for (const sitting of [false, true]) {
          const common = { vehicle, time, hunger, sitting, shelter: time === 18000 ? 'inside' : 'outside', flying: false };
          for (const ownerMode of ['survival', 'creative']) rows.push({ ...common, ownerMode, action: 'assist' });
          rows.push({ ...common, ownerMode: 'creative', action: 'takeoff' });
          rows.push({ ...common, ownerMode: 'survival', action: 'care' });
        }
  const controls = [];
  for (const vehicle of VEHICLES.filter(type => type !== 'minecraft:minecart'))
    for (const ownerMode of ['survival', 'creative'])
      controls.push({ vehicle, ownerMode, time: 1000, hunger: 0, sitting: false, shelter: 'outside', flying: false, action: 'reboard' });
  return [...controls, ...rows];
}

// Controlled /ride mounts prove passenger behavior, not natural automatic boarding.
function vehicleCases({ prepare, command, request, state, entity, advance, base, player, check }) {
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
  return vehicleInputs().map(inputs => ({
    name: `vehicle-${inputs.action}-${inputs.vehicle.split(':')[1]}-${inputs.ownerMode}-${inputs.time}-${inputs.hunger}-${inputs.sitting ? 'sit' : 'follow'}`,
    inputs,
    setup: async () => {
      await prepare(inputs);
      await command('tick freeze');
      await request('/command', { command: `clear ${player} mushroom_yorkie:yorkie_harness` }, true);
      const initial = await state();
      const pet = entity(initial);
      const harness = await request('/use-entity', { type: pet.type, radius: 8, item: 'mushroom_yorkie:yorkie_harness', count: 1 });
      check(harness.target.custom.harness, 'Vehicle fixture did not equip its harness');
      await command(`item replace entity ${pet.uuid} weapon.mainhand with minecraft:amethyst_shard[minecraft:custom_name='"Vehicle keepsake"'] 2`);
      const x = base.x + 0.5, z = base.z + 0.5;
      if (inputs.vehicle === 'minecraft:minecart') await command(`setblock ${base.x} ${base.y} ${base.z} minecraft:rail[shape=east_west]`);
      await command(`summon ${inputs.vehicle} ${x} ${base.y + 0.1} ${z} {Tags:["matrix_vehicle"],Invulnerable:1b}`);
      const vehicle = (await state()).players[0].nearbyEntities.find(e => e.type === inputs.vehicle);
      check(vehicle, 'Native vehicle summon is not observable');
      if (inputs.vehicle === 'minecraft:oak_chest_boat') {
        await command(`item replace entity ${vehicle.uuid} container.0 with minecraft:diamond[minecraft:custom_name='"Boat cargo"'] 3`);
      }
      await command(`ride ${pet.uuid} mount ${vehicle.uuid}`);
      const mounted = await frozenStep(2);
      const passenger = assertVehicleMount(mounted, pet.uuid, vehicle.uuid);
      check(passenger.tameable.orderedToSit === inputs.sitting, 'Mount fixture changed the sit order');
      const equipment = await nativeItems(pet.uuid, 'equipment');
      const cargo = inputs.vehicle === 'minecraft:oak_chest_boat' ? await nativeItems(vehicle.uuid, 'Items') : null;
      check(JSON.stringify(equipment).includes('Vehicle keepsake'), 'Named pet equipment was not established');
      if (cargo) check(JSON.stringify(cargo).includes('Boat cargo'), 'Named chest-boat cargo was not established');
      return { initial, mounted, petUuid: pet.uuid, vehicleUuid: vehicle.uuid, vehicleId: vehicle.id, equipment, cargo, mountingMethod: 'native-ride-command' };
    },
    run: async (fixture, result, save) => {
      const observed = result.observed = { fixture, trace: [] };
      function inspect(snapshot, stage, ownerFlying = false) {
        const pet = entity(snapshot);
        observed.trace.push({ stage, snapshot });
        save();
        assertVehicleOwnerState(snapshot, inputs.ownerMode, ownerFlying);
        check(pet?.uuid === fixture.petUuid && pet.tameable?.ownedByPlayer, 'Vehicle action lost the original owned Mushroom');
        check(pet.health === pet.maxHealth, 'Vehicle action damaged Mushroom');
        check(pet.tameable.orderedToSit === inputs.sitting, 'Vehicle action toggled the original sit/follow order');
        check(pet.custom.harness, 'Vehicle action lost the harness');
        return pet;
      }
      function inspectMounted(snapshot, stage) {
        const pet = inspect(snapshot, stage);
        assertVehicleMount(snapshot, fixture.petUuid, fixture.vehicleUuid);
        return pet;
      }
      const ready = await state();
      const before = inspect(ready, 'before-action');
      assertVehicleMount(ready, fixture.petUuid, fixture.vehicleUuid);
      if (inputs.action === 'care') {
        observed.feed = await request('/use-entity', { type: before.type, radius: 8, item: 'minecraft:apple', count: 2 });
        const fed = inspectMounted(await state(), 'fed-mounted');
        check(fed.vehicle?.id === fixture.vehicleId, 'Mounted feeding unexpectedly dismounted Mushroom');
        check(fed.custom.needs.hunger === Math.max(0, before.custom.needs.hunger - 32), 'Mounted apple applied an unexpected food change');
        const held = await command(`data get entity ${player} SelectedItem.count`);
        check(held.result === 1, 'Mounted feeding did not consume exactly one survival apple');
        // Empty-hand dismount has priority; using a harness item explicitly toggles it.
        await request('/use-entity', { type: before.type, radius: 8, item: 'mushroom_yorkie:yorkie_harness', count: 1 });
        const removed = entity(await state());
        observed.harnessRemoved = removed;
        check(!removed.custom.harness && removed.vehicle?.id === fixture.vehicleId, 'Mounted harness removal failed or dismounted the pet');
        const removedCount = await command(`clear ${player} mushroom_yorkie:yorkie_harness 0`);
        check(removedCount.result === 2, 'Harness removal did not retain the spare and return exactly one worn harness');
        await request('/use-entity', { type: before.type, radius: 8 });
        const restored = inspectMounted(await state(), 'harness-restored-mounted');
        check(restored.vehicle?.id === fixture.vehicleId, 'Mounted harness equip dismounted Mushroom');
        const restoredCount = await command(`clear ${player} mushroom_yorkie:yorkie_harness 0`);
        check(restoredCount.result === 1, 'Mounted harness equip did not consume exactly one survival harness');
        // A completed care case deliberately leaves a passenger for post-run inspection.
        await command('tick unfreeze');
        const settled = inspectMounted(await advance(40), 'mounted-full-ticks');
        check(settled.vehicle?.id === fixture.vehicleId && !settled.noGravity, 'Grounded owner did not retain a normal passenger');
      } else if (inputs.action === 'assist' || inputs.action === 'reboard') {
        observed.interaction = await request('/use-entity', { type: before.type, radius: 8, emptyHand: true });
        check(!inspect(await state(), 'assisted-dismount').vehicle, 'Owner empty-hand interaction did not dismount Mushroom');
        if (inputs.action === 'reboard') {
          // Separate controlled contact from ordinary companionship: NoAI holds
          // the pet still; the real boat ticks and attempts automatic boarding.
          await command(`data merge entity ${fixture.petUuid} {NoAI:1b}`);
          await command('tick unfreeze');
          const waiting = inspect(await advance(80), 'past-vanilla-cooldown');
          check(!waiting.vehicle, 'Mushroom boarded before the controlled contact challenge');
          await command('tick freeze');
          const carrier = (await state()).players[0].nearbyEntities.find(e => e.uuid === fixture.vehicleUuid);
          check(carrier, 'Reboarding challenge lost its original boat');
          await command(`tp ${fixture.petUuid} ${carrier.position.x} ${carrier.position.y + 0.1} ${carrier.position.z}`);
          observed.reboardContact = await state();
          const contacted = inspect(await frozenStep(2), 'native-automatic-boarding-contact');
          check(!contacted.vehicle, 'Boat automatically boarded Mushroom during the owner-dismount grace period');
          await command(`data merge entity ${fixture.petUuid} {NoAI:0b}`);
        }
        await command('tick unfreeze');
        await command(`tp ${player} ${base.x - 3} ${base.y} ${base.z + 0.5}`);
        const settled = inspect(await advance(60), 'after-dismount-full-ticks');
        check(!settled.vehicle && !settled.noGravity, 'Assisted dismount did not settle with normal gravity');
      } else {
        // A grounded client can send flying=false after the bridge's acknowledgement.
        // Move first, then require stable replicated flight before ticking the pet.
        await command(`tp ${player} ${base.x - 1.5} ${base.y + 2} ${base.z + 0.5}`);
        observed.flightSetup = [];
        let stable = false;
        await new Promise(resolve => setTimeout(resolve, 150));
        for (let attempt = 0; attempt < 5 && !stable; attempt++) {
          const reply = await request('/player-abilities', { player, flying: true, mayfly: true });
          const immediate = await state();
          await new Promise(resolve => setTimeout(resolve, 150));
          const replicated = await state();
          observed.flightSetup.push({ reply, immediate, replicated });
          save();
          stable = immediate.players[0].abilities.flying && replicated.players[0].abilities.flying;
        }
        if (!stable) {
          const error = new Error('Could not establish stable client/server creative flight');
          error.phase = 'setup';
          throw error;
        }
        await command('tick unfreeze');
        for (let ticks = 10; ticks <= 60; ticks += 10) {
          const airborne = inspect(await advance(10), `creative-takeoff-${ticks}`, true);
          check(!airborne.vehicle, 'Mushroom was mounted at the creative-takeoff observation');
          check(airborne.noGravity === !inputs.sitting, 'Takeoff ignored the original sit/follow flight choice');
          check(!airborne.custom.curledUpSleeping, 'Mushroom slept through owner takeoff');
          if (inputs.sitting) check(airborne.onGround, 'Ordered sitting pet did not remain grounded after dismount');
        }
        await request('/player-abilities', { player, flying: false, mayfly: true });
        await command(`tp ${player} ${base.x - 2} ${base.y} ${base.z + 0.5}`);
        const landed = inspect(await advance(100), 'owner-landed');
        check(!landed.vehicle && !landed.noGravity, 'Landing retained vehicle or flight state');
      }
      observed.equipmentAfter = await nativeItems(fixture.petUuid, 'equipment');
      assert.deepEqual(observed.equipmentAfter, fixture.equipment, 'Vehicle sequence lost native keepsake item data');
      if (fixture.cargo) {
        observed.cargoAfter = await nativeItems(fixture.vehicleUuid, 'Items');
        assert.deepEqual(observed.cargoAfter, fixture.cargo, 'Vehicle sequence changed chest-boat cargo');
      }
      return observed;
    },
    cleanup: () => command('tick unfreeze')
  }));
}

module.exports = { VEHICLES, vehicleInputs, vehicleCases, assertVehicleMount, assertVehicleOwnerState };
