'use strict';

const assert = require('node:assert/strict');
const { VEHICLES, assertVehicleMount, assertVehicleOwnerState, vehicleTools } = require('./yorkie-vehicle-fixture');

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
  const { nativeItems, frozenStep, prepareVehicle, enableFlight } = vehicleTools({ prepare, command, request, state, entity, advance, base, player, check });
  return vehicleInputs().map(inputs => ({
    name: `vehicle-${inputs.action}-${inputs.vehicle.split(':')[1]}-${inputs.ownerMode}-${inputs.time}-${inputs.hunger}-${inputs.sitting ? 'sit' : 'follow'}`,
    inputs,
    setup: () => prepareVehicle(inputs),
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
        await require('./yorkie-vehicle-care').exerciseMountedCare({ request, state, entity, command, player, advance, check }, fixture, before, observed, inspectMounted);
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
        observed.flightSetup = [];
        await enableFlight(observed.flightSetup, save);
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
