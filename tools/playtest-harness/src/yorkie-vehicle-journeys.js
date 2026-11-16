'use strict';

const assert = require('node:assert/strict');
const { VEHICLES, assertVehicleMount, assertVehicleOwnerState, assertVehicleReach, vehicleTools } = require('./yorkie-vehicle-fixture');
const { readWorldTime } = require('./yorkie-clock');
const { advanceJourneyOrder } = require('./yorkie-journey-order');
const { exerciseMountedCare } = require('./yorkie-vehicle-care');

function journeyInputs() {
  const rows = [];
  for (const vehicle of VEHICLES)
    for (const time of [1000, 18000])
      for (const hunger of [0, 90])
        for (const sitting of [false, true]) {
          const common = { vehicle, time, hunger, sitting, flying: false,
            layout: vehicle === 'minecraft:minecart' ? 'rail' : 'water', shelter: time === 18000 ? 'inside' : 'outside' };
          for (const ownerMode of ['survival', 'creative']) rows.push({ ...common, ownerMode, action: 'assist' });
          rows.push({ ...common, ownerMode: 'creative', action: 'takeoff' });
          rows.push({ ...common, ownerMode: 'survival', action: 'care' });
        }
  for (const vehicle of VEHICLES.filter(type => type !== 'minecraft:minecart'))
    for (const time of [1000, 18000])
      for (const hunger of [0, 90])
        for (const ownerMode of ['survival', 'creative'])
          rows.push({ vehicle, time, hunger, ownerMode, sitting: true, flying: false, offshore: true,
            immersionMethod: ownerMode === 'creative' ? 'controlled-submerge' : 'native-fall-after-boat-departure',
            layout: 'water', shelter: time === 18000 ? 'inside' : 'outside', action: 'assist-immersion' });
  return rows;
}

function journeyCases(context) {
  const { command, request, state, entity, advance, base, player, check } = context;
  const { prepareVehicle, frozenStep, nativeItems, enableFlight } = vehicleTools(context);
  async function build(inputs) {
    const audit = [];
    if (inputs.layout === 'water') {
      await command(`fill ${base.x - 3} ${base.y - 3} ${base.z - 2} ${base.x + 4} ${base.y - 1} ${base.z + 2} minecraft:stone`);
      await command(`fill ${base.x - 2} ${base.y - 2} ${base.z - 1} ${base.x + 3} ${base.y - 1} ${base.z + 1} minecraft:water`);
      // The boat reaches the east bank; the nighttime room needs an actual dock
      // doorway, otherwise native dismount correctly rejects the solid wall.
      await command(`fill ${base.x + 4} ${base.y} ${base.z - 1} ${base.x + 4} ${base.y + 2} ${base.z + 1} minecraft:air`);
      for (const [x, y, z, expected] of [
        [base.x, base.y - 1, base.z, 'minecraft:water'],
        [base.x, base.y - 3, base.z, 'minecraft:stone'],
        [base.x, base.y - 1, base.z - 2, 'minecraft:stone'],
        [base.x, base.y, base.z, 'minecraft:air']
      ]) {
        const block = await request('/block', { x, y, z });
        audit.push({ x, y, z, expected, block });
        check(block.block === expected, 'Contained-water vehicle fixture has the wrong block');
      }
    } else {
      await command(`fill ${base.x - 3} ${base.y} ${base.z} ${base.x + 3} ${base.y} ${base.z} minecraft:rail[shape=east_west]`);
      for (const x of [base.x - 4, base.x + 4]) await command(`setblock ${x} ${base.y} ${base.z} minecraft:stone`);
      for (const x of [base.x - 3, base.x, base.x + 3]) {
        const block = await request('/block', { x, y: base.y, z: base.z });
        audit.push({ x, expected: 'minecraft:rail', block });
        check(block.block === 'minecraft:rail', 'Rail fixture has a missing track block');
      }
    }
    await command(`tp ${player} ${base.x - 2.5} ${base.y} ${base.z + 0.5}`);
    return { audit, spawn: { x: base.x - (inputs.layout === 'water' && !inputs.offshore ? 0.5 : 1.5), y: base.y + 0.1, z: base.z + 0.5 } };
  }
  return journeyInputs().map(inputs => ({
    name: `journey-${inputs.layout}-${inputs.action}-${inputs.vehicle.split(':')[1]}-${inputs.ownerMode}-${inputs.time}-${inputs.hunger}-${inputs.sitting ? 'sit' : 'follow'}`,
    inputs,
    // Observe the first real passenger ticks in run, so a lost order during floating
    // is a gameplay failure, rather than quietly becoming a failed mount fixture.
    setup: () => prepareVehicle(inputs, { settleTicks: 0, build: () => build(inputs) }),
    run: async (fixture, result, save) => {
      const observed = result.observed = { fixture, trace: [], wetOrderRelease: false };
      const vehicleIn = s => s.players[0].nearbyEntities.find(e => e.uuid === fixture.vehicleUuid);
      const wet = frame => frame.pet.inWater || ['minecraft:water', 'minecraft:bubble_column'].includes(frame.footBlock.block);
      let orderState = { originalSit: inputs.sitting, expectedSit: inputs.sitting };
      async function observe(snapshot, stage, { mounted = false, flying = false, afterDismount = false } = {}) {
        const pet = entity(snapshot), carrier = vehicleIn(snapshot);
        check(pet, 'Journey pet is not observable');
        const footBlock = await request('/block', { x: Math.floor(pet.position.x), y: Math.floor(pet.position.y), z: Math.floor(pet.position.z) });
        const frame = { stage, snapshot, pet, carrier, footBlock };
        observed.trace.push(frame);
        save();
        assertVehicleOwnerState(snapshot, inputs.ownerMode, flying);
        check(pet.uuid === fixture.petUuid && pet.tameable.ownedByPlayer, 'Journey lost the original owned pet');
        check(pet.health === pet.maxHealth, 'Journey damaged Mushroom');
        check(pet.custom.harness, 'Journey lost the harness');
        const clock = snapshot.tickAudit?.after ?? await readWorldTime(command);
        frame.worldClock = clock;
        orderState = advanceJourneyOrder(orderState, { orderedToSit: pet.tameable.orderedToSit,
          mounted: Boolean(pet.vehicle), wet: wet(frame), afterDismount, clock });
        observed.wetOrderRelease = orderState.firstWetClock !== undefined;
        observed.firstWetClock = orderState.firstWetClock;
        if (mounted) assertVehicleMount(snapshot, fixture.petUuid, fixture.vehicleUuid);
        return pet;
      }
      const before = await state();
      await observe(before, 'mounted-before-travel', { mounted: true });
      observed.motionRequests = [];
      async function drive(ticks, stop = false) {
        const speed = stop ? '0.0' : inputs.layout === 'rail' ? '0.16' : inputs.offshore ? '0.3' : '0.4';
        const reply = await command(`data merge entity ${fixture.vehicleUuid} {Motion:[${speed}d,0.0d,0.0d]}`);
        observed.motionRequests.push({ ticks, stop, reply });
        save();
      }
      await drive(0);
      const start = vehicleIn(before).position;
      const targetDistance = inputs.offshore ? 3 : 2;
      const step = inputs.offshore ? 1 : 5;
      let stopped = false;
      let last;
      for (let ticks = step; ticks <= 30; ticks += step) {
        last = await frozenStep(step);
        await observe(last, `travel-${ticks}`, { mounted: true });
        const current = vehicleIn(last).position;
        const distance = Math.hypot(current.x - start.x, current.z - start.z);
        // A single initial impulse was observed to stop short. Drive this
        // fixture in frozen native steps, without uncontrolled wall-clock drift.
        // Offshore travel stops before the bank so the empty hull can depart.
        if (inputs.offshore && !stopped && distance >= targetDistance) {
          observed.stopDisplacement = distance;
          await drive(ticks, true);
          stopped = true;
        } else if (!stopped && distance < targetDistance && ticks % 5 === 0 && ticks < 30) await drive(ticks);
      }
      const traveled = vehicleIn(last);
      observed.displacement = Math.hypot(traveled.position.x - start.x, traveled.position.z - start.z);
      if (observed.displacement < 2) {
        const error = new Error('Vehicle did not actually travel at least two blocks');
        error.phase = 'setup';
        throw error;
      }
      if (inputs.layout === 'water') {
        check(traveled.position.y > base.y - 0.8 && traveled.position.y < base.y + 0.2, 'Boat was not floating at the contained water surface');
      } else {
        const rail = await request('/block', { x: Math.floor(traveled.position.x), y: base.y, z: base.z });
        observed.trackAfterTravel = rail;
        check(rail.block === 'minecraft:rail', 'Moving minecart left the real rail fixture');
      }
      // Bank/trackside interaction is reachable; freezing isolates exact food/item changes.
      await command('tick freeze');
      const owner = inputs.layout === 'water'
        ? { x: base.x + (inputs.offshore ? 4.25 : 6), y: base.y, z: base.z + 0.5 }
        : { x: traveled.position.x, y: base.y, z: base.z - 1.5 };
      await request('/teleport', { player, ...owner });
      if (inputs.layout === 'water' && !inputs.offshore) {
        // Vanilla boat exits use the passenger's yaw. This is a controlled dock
        // exit facing the bank, not a claim about natural approach/orientation.
        observed.dockOrientation = await command(`data merge entity ${fixture.petUuid} {Rotation:[-90.0f,0.0f]}`);
        const yaw = await command(`data get entity ${fixture.petUuid} Rotation[0]`);
        check(yaw.result === -90, 'Dock fixture did not face its passenger toward the bank');
        const floor = await request('/block', { x: base.x + 4, y: base.y - 1, z: base.z });
        check(floor.block === 'minecraft:stone', 'Dock exit does not have a solid bank');
      }
      const ready = await state();
      const passenger = await observe(ready, 'before-owner-action', { mounted: true });
      const actualOwner = ready.players[0].position;
      const ownerFloor = await request('/block', { x: Math.floor(actualOwner.x), y: Math.floor(actualOwner.y - 0.05), z: Math.floor(actualOwner.z) });
      observed.ownerPlacement = { intended: owner, actual: actualOwner, floor: ownerFloor };
      if (Math.hypot(actualOwner.x - owner.x, actualOwner.y - owner.y, actualOwner.z - owner.z) > 0.05
        || !['minecraft:grass_block', 'minecraft:stone', 'minecraft:oak_planks'].includes(ownerFloor.block)) {
        const error = new Error('Journey owner placement lacks the intended supported bank/trackside position');
        error.phase = 'setup';
        throw error;
      }
      assertVehicleReach(passenger, inputs.ownerMode);
      if (inputs.action === 'care') {
        await exerciseMountedCare(context, fixture, passenger, observed,
          (snapshot, stage) => observe(snapshot, stage, { mounted: true }));
      } else {
        if (inputs.action === 'assist' || inputs.action === 'assist-immersion') {
          observed.interaction = await request('/use-entity', { type: passenger.type, radius: 8, emptyHand: true });
          const dismounted = await observe(await state(), 'assisted-dismount', { afterDismount: true });
          check(!dismounted.vehicle, 'Journey owner help did not dismount Mushroom');
          for (let tick = 1; tick <= 8; tick++) {
            await observe(await frozenStep(1), `assisted-settle-${tick}`, { afterDismount: true });
          }
          if (inputs.offshore) {
            // The owner steps back on the bank. Moving the empty boat out from
            // under its former sitting passenger creates real native immersion.
            await request('/teleport', { player, x: base.x + 6, y: base.y, z: base.z + 0.5 });
            const beforeDeparture = vehicleIn(await state()).position;
            // A downward bob separates the supporting hull from the pet's feet
            // before horizontal travel. The east-bank obstruction stays in play.
            observed.departureMotion = await command(`data merge entity ${fixture.vehicleUuid} {Motion:[0.4d,-0.08d,0.0d]}`);
            for (let tick = 1; tick <= 24; tick++) {
              if (tick === 3 && inputs.ownerMode === 'creative') {
                // Creative recovery can preempt bodily immersion at first foot
                // contact. Explicitly seed a submerged state for this control;
                // the survival arm separately observes a native fall into water.
                observed.entryPlacement = { x: beforeDeparture.x, y: base.y - 0.94, z: beforeDeparture.z, method: inputs.immersionMethod };
                observed.entryCommand = await command(`tp ${fixture.petUuid} ${beforeDeparture.x} ${base.y - 0.94} ${beforeDeparture.z}`);
              }
              await observe(await frozenStep(1), `offshore-immersion-${tick}`, { afterDismount: true });
            }
            const afterDeparture = vehicleIn(await state()).position;
            observed.emptyBoatDisplacement = Math.hypot(afterDeparture.x - beforeDeparture.x, afterDeparture.z - beforeDeparture.z);
            if (observed.emptyBoatDisplacement < 1) {
              const error = new Error('Empty boat did not actually move away from its former passenger');
              error.phase = 'setup';
              throw error;
            }
            const immersed = observed.trace.findIndex(frame => frame.stage.startsWith('offshore-immersion') && frame.pet.inWater && !frame.pet.vehicle);
            if (immersed < 0) {
              const error = new Error('Offshore fixture did not establish actual pet immersion');
              error.phase = 'setup';
              throw error;
            }
            check(observed.wetOrderRelease && observed.trace.slice(immersed).some(frame => !frame.pet.tameable.orderedToSit),
              'Offshore immersion did not release the sit order');
          }
        } else {
          observed.flightSetup = [];
          await enableFlight(observed.flightSetup, save, { ...owner, y: base.y + 2 });
          for (let tick = 1; tick <= 5; tick++) {
            const pet = await observe(await frozenStep(1), `takeoff-dismount-${tick}`, { flying: true, afterDismount: true });
            if (!pet.vehicle) break;
          }
          check(!entity(observed.trace.at(-1).snapshot).vehicle, 'Journey takeoff did not eject the passenger');
          await command('tick unfreeze');
          for (let ticks = 5; ticks <= 60; ticks += 5) {
            const pet = await observe(await advance(5), `flying-${ticks}`, { flying: true, afterDismount: true });
            check(!pet.custom.curledUpSleeping, 'Journey pet slept through owner takeoff');
            check(!pet.vehicle && pet.noGravity === !pet.tameable.orderedToSit, 'Journey takeoff did not respect flight or the wet safety transition');
            if (orderState.expectedSit && ticks >= 20) check(pet.onGround, 'Dry sitting pet did not settle after boat/cart dismount');
          }
          await request('/player-abilities', { player, flying: false, mayfly: true });
          await request('/teleport', { player, ...owner });
        }
        await command('tick unfreeze');
        let recovered;
        for (let ticks = 20; ticks <= 400; ticks += 20) {
          const snapshot = await advance(20);
          const pet = await observe(snapshot, `grounded-recovery-${ticks}`, { afterDismount: true });
          if (!pet.vehicle && pet.onGround && !pet.noGravity && !pet.inWater && pet.position.y >= base.y - 0.3 && (pet.distance < 4 || orderState.expectedSit)) {
            const underfoot = await request('/block', { x: Math.floor(pet.position.x), y: Math.floor(pet.position.y - 0.05), z: Math.floor(pet.position.z) });
            if (!['minecraft:air', 'minecraft:water', 'minecraft:bubble_column'].includes(underfoot.block)) {
              recovered = snapshot; observed.underfoot = underfoot; break;
            }
          }
        }
        observed.recovered = recovered;
        check(recovered, 'Journey did not end with Mushroom safely grounded on the bank/trackside');
      }
      observed.equipmentAfter = await nativeItems(fixture.petUuid, 'equipment');
      assert.deepEqual(observed.equipmentAfter, fixture.equipment, 'Journey changed named pet possessions');
      if (fixture.cargo) {
        observed.cargoAfter = await nativeItems(fixture.vehicleUuid, 'Items');
        assert.deepEqual(observed.cargoAfter, fixture.cargo, 'Journey changed chest-boat cargo');
      }
      return observed;
    },
    cleanup: () => command('tick unfreeze')
  }));
}

module.exports = { journeyInputs, journeyCases };
