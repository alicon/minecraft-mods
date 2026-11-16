'use strict';

const assert = require('node:assert/strict');
const { VEHICLES, assertVehicleMount, assertVehicleOwnerState, vehicleTools } = require('./yorkie-vehicle-fixture');
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
    return { audit, spawn: { x: base.x - 1.5, y: base.y + 0.1, z: base.z + 0.5 } };
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
      let expectedSit = inputs.sitting;
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
        if (afterDismount && !pet.vehicle && wet(frame)) {
          expectedSit = false;
          observed.wetOrderRelease = true;
        }
        check(pet.tameable.orderedToSit === expectedSit, 'Journey changed the sit/follow order without a witnessed wet dismount');
        if (mounted) assertVehicleMount(snapshot, fixture.petUuid, fixture.vehicleUuid);
        return pet;
      }
      const before = await state();
      await observe(before, 'mounted-before-travel', { mounted: true });
      observed.motionRequest = await command(`data merge entity ${fixture.vehicleUuid} {Motion:[${inputs.layout === 'rail' ? '0.16' : '0.4'}d,0.0d,0.0d]}`);
      await command('tick unfreeze');
      const start = vehicleIn(before).position;
      let last;
      for (let ticks = 5; ticks <= 30; ticks += 5) {
        last = await advance(5);
        await observe(last, `travel-${ticks}`, { mounted: true });
      }
      const traveled = vehicleIn(last);
      observed.displacement = Math.hypot(traveled.position.x - start.x, traveled.position.z - start.z);
      check(observed.displacement >= 2, 'Vehicle did not actually travel at least two blocks');
      if (inputs.layout === 'water') {
        check(traveled.position.y > base.y - 0.8 && traveled.position.y < base.y + 0.2, 'Boat was not floating at the contained water surface');
      } else {
        const rail = await request('/block', { x: Math.floor(traveled.position.x), y: base.y, z: base.z });
        observed.trackAfterTravel = rail;
        check(rail.block === 'minecraft:rail', 'Moving minecart left the real rail fixture');
      }
      // Bank/trackside interaction is reachable; freezing isolates exact food/item changes.
      await command('tick freeze');
      const owner = { x: traveled.position.x, y: base.y, z: base.z - 1.5 };
      await command(`tp ${player} ${owner.x} ${owner.y} ${owner.z}`);
      const ready = await state();
      const passenger = await observe(ready, 'before-owner-action', { mounted: true });
      if (inputs.action === 'care') {
        await exerciseMountedCare(context, fixture, passenger, observed,
          (snapshot, stage) => observe(snapshot, stage, { mounted: true }));
      } else {
        if (inputs.action === 'assist') {
          observed.interaction = await request('/use-entity', { type: passenger.type, radius: 8, emptyHand: true });
          const dismounted = await observe(await state(), 'assisted-dismount');
          check(!dismounted.vehicle, 'Journey owner help did not dismount Mushroom');
          if (wet(observed.trace.at(-1))) { expectedSit = false; observed.wetOrderRelease = true; }
          for (let tick = 1; tick <= 8; tick++) {
            await observe(await frozenStep(1), `assisted-settle-${tick}`, { afterDismount: true });
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
            check(!pet.vehicle && pet.noGravity === !expectedSit, 'Journey takeoff did not respect flight or the wet safety transition');
            if (expectedSit && ticks >= 20) check(pet.onGround, 'Dry sitting pet did not settle after boat/cart dismount');
          }
          await request('/player-abilities', { player, flying: false, mayfly: true });
          await command(`tp ${player} ${owner.x} ${owner.y} ${owner.z}`);
        }
        await command('tick unfreeze');
        let recovered;
        for (let ticks = 20; ticks <= 400; ticks += 20) {
          const snapshot = await advance(20);
          const pet = await observe(snapshot, `grounded-recovery-${ticks}`, { afterDismount: true });
          if (!pet.vehicle && pet.onGround && !pet.noGravity && !pet.inWater && pet.position.y >= base.y - 0.3 && (pet.distance < 4 || expectedSit)) {
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
