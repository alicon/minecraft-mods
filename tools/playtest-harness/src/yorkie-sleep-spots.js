'use strict';

const { OWNER_STATES } = require('./yorkie-inputs');

function sleepSpotInputs() {
  return ['dog_bed', 'doghouse'].flatMap((spot) => [0, 90].flatMap((hunger) =>
    OWNER_STATES.filter((owner) => !owner.flying).map((owner) => ({ spot, hunger, ...owner, time: 1000, shelter: spot === 'doghouse' ? 'outside' : 'inside', sitting: false }))));
}

function sleepSpotCases({ prepare, command, request, entity, advance, base, check }) {
  return sleepSpotInputs().map((inputs) => ({
    name: `rest-${inputs.spot}-${inputs.ownerMode}-${inputs.hunger === 0 ? 'fed' : 'hungry'}`,
    inputs,
    setup: async () => {
      const prepared = await prepare(inputs);
      const spot = { x: base.x + 2, y: base.y, z: base.z };
      await command(`setblock ${spot.x} ${spot.y} ${spot.z} mushroom_yorkie:${inputs.spot}`);
      check((await request('/block', spot)).block === `mushroom_yorkie:${inputs.spot}`, 'Sleep spot fixture was not placed');
      const day = await advance(40);
      check(!entity(day)?.custom.curledUpSleeping, 'Daytime sleep spot control unexpectedly slept');
      return { prepared, spot, day };
    },
    run: async (fixture, result) => {
      result.observed = { fixture, trace: [] };
      const original = entity(fixture.day);
      await command('time set night');
      for (let ticks = 20; ticks <= 200; ticks += 20) {
        const pet = entity(await advance(20));
        result.observed.trace.push({ ticks, pet });
        check(pet?.uuid === original.uuid && pet.health === pet.maxHealth && !pet.inWater, 'Sleep spot lost or harmed the pet');
      }
      for (const { pet } of result.observed.trace.slice(-3)) {
        check(pet.custom.curledUpSleeping && pet.tameable.sittingPose, 'Pet did not remain asleep on the intended sleep spot');
        check(Math.abs(pet.position.x - fixture.spot.x - 0.5) < 0.4 && Math.abs(pet.position.z - fixture.spot.z - 0.5) < 0.4
          && Math.abs(pet.position.y - fixture.spot.y - 0.25) < 0.2, 'Pet slept away from its bed/inside-doghouse anchor');
        check(!pet.noGravity && !pet.tameable.orderedToSit, 'Sleep spot retained flight or invented a sit order');
      }
      await command('time set day');
      const dawn = entity(await advance(60));
      result.observed.dawn = dawn;
      check(dawn?.uuid === original.uuid && !dawn.custom.curledUpSleeping && dawn.health === dawn.maxHealth, 'Pet did not wake safely at dawn');
      return result.observed;
    }
  }));
}

module.exports = { sleepSpotInputs, sleepSpotCases };
