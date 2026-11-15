'use strict';

const { OWNER_STATES } = require('./yorkie-inputs');

function outdoorInputs() {
  const owners = OWNER_STATES.filter((owner) => !owner.flying);
  const rows = [];
  for (const time of [1000, 18000])
    for (const hunger of [0, 90])
      for (const sitting of [false, true])
        for (const owner of owners)
          rows.push({ time, hunger, sitting, ...owner, shelter: 'inside', potty: 100 });
  for (const potty of [81, 90])
    for (const owner of owners)
      rows.push({ time: 1000, hunger: 0, sitting: false, ...owner, shelter: 'inside', potty });
  return rows;
}

function outdoorCases({ prepare, command, request, state, entity, advance, base, selector, check }) {
  async function door(open) {
    for (const [dy, half] of [[0, 'lower'], [1, 'upper']]) {
      await command(`setblock ${base.x + 4} ${base.y + dy} ${base.z} minecraft:oak_door[half=${half},facing=east,open=${open}]`);
    }
    for (const dy of [0, 1]) {
      const block = await request('/block', { x: base.x + 4, y: base.y + dy, z: base.z });
      check(block.state.includes(`open=${open}`), 'Door half did not match the requested open state');
    }
  }
  const reliefDay = async () => (await request('/command', { command: `data get entity ${selector} LastReliefDay` })).result;
  return outdoorInputs().map((inputs) => ({
    name: `outdoor-${inputs.time === 1000 ? 'day' : 'night'}-${inputs.ownerMode}-${inputs.hunger === 0 ? 'fed' : 'hungry'}-${inputs.sitting ? 'sit' : 'follow'}-p${inputs.potty}`,
    inputs,
    setup: async () => {
      const fixture = await prepare(inputs);
      await command(`fill ${base.x + 5} ${base.y} ${base.z - 7} ${base.x + 12} 319 ${base.z + 7} minecraft:air`);
      await command(`fill ${base.x + 5} ${base.y - 1} ${base.z - 7} ${base.x + 12} ${base.y - 1} ${base.z + 7} minecraft:grass_block`);
      await door(false);
      await command(`data merge entity ${selector} {Potty:${inputs.potty},Hunger:${inputs.hunger},Energy:80,Health:12.0f}`);
      const outsideAudit = await request('/count-blocks', { x1: base.x + 5, y1: base.y, z1: base.z - 7, x2: base.x + 12, y2: 319, z2: base.z + 7 });
      check(outsideAudit.counts['minecraft:air'] === outsideAudit.volume, 'Outdoor approach has overhead obstacles');
      check(await reliefDay() === -1, 'Fresh pet already has a daily relief record');
      return { snapshot: await state(), fixtureAudit: fixture.fixtureAudit, outsideAudit };
    },
    run: async (fixture, result) => {
      result.observed = { fixture, trace: [] };
      const original = entity(fixture.snapshot);
      async function observe(stage, ticks) {
        const snapshot = await advance(ticks);
        const pet = entity(snapshot);
        const day = await reliefDay();
        result.observed.trace.push({ stage, ticks, pet, reliefDay: day });
        check(pet?.uuid === original.uuid, 'Outdoor trip lost or replaced the original pet');
        check(pet.health >= original.health, 'Outdoor trip damaged Mushroom');
        check(pet.tameable.orderedToSit === inputs.sitting, 'Outdoor trip changed the explicit sit/follow order');
        if (inputs.sitting) check(Math.hypot(pet.position.x - original.position.x, pet.position.z - original.position.z) < 1,
          'Potty urgency overrode an explicit sit order');
        return { snapshot, pet, day };
      }
      async function finishRelief(day, stage) {
        let observed;
        for (let ticks = 20; ticks <= 600; ticks += 20) {
          observed = await observe(stage, 20);
          if (observed.day === day) break;
        }
        check(observed.day === day, `Expected relief day ${day}, observed ${observed.day}; needs=${JSON.stringify(observed.pet.custom.needs)}`);
        check(observed.pet.custom.needs.potty <= 10, 'Daily relief record did not reset the need');
        return observed;
      }
      const closed = await observe('closed', 200);
      result.observed.closed = closed.snapshot;
      check(closed.day === -1 && closed.pet.position.x < base.x + 5, 'Closed-door pet escaped or relieved indoors');
      await door(true);
      if (inputs.sitting || inputs.time === 18000) {
        const quiet = await observe('open-quiet', 240);
        result.observed.final = quiet.snapshot;
        check(quiet.day === -1 && quiet.pet.position.x < base.x + 5, 'Open door overrode sitting or nighttime shelter');
        if (inputs.time === 18000) check(quiet.pet.custom.curledUpSleeping, 'Night pet failed to settle despite shelter');
        return result.observed;
      }
      await finishRelief(0, 'open-relief');
      const home = await observe('returned-home', 120);
      check(home.pet.position.x < base.x + 4 && home.pet.distance < 3, 'Pet did not resume following its indoor owner after relief');
      await door(false);
      // Reset the hunger fixture at each synthetic day boundary; this is not a starvation test.
      await request('/command', { command: `data merge entity ${selector} {Potty:${inputs.potty},Hunger:${inputs.hunger}}` }, true);
      const sameDay = await observe('same-day', 120);
      check(sameDay.day === 0 && sameDay.pet.position.x < base.x + 4 && sameDay.pet.distance < 3,
        'Pet repeated the completed daily potty trip');
      await command('time set 25000');
      await request('/command', { command: `data merge entity ${selector} {Potty:${inputs.potty},Hunger:${inputs.hunger}}` }, true);
      check(await reliefDay() === 0, 'Day change rewrote the previous relief record');
      await door(true);
      const nextDay = await finishRelief(1, 'next-day');
      result.observed.final = nextDay.snapshot;
      return result.observed;
    }
  }));
}

module.exports = { outdoorInputs, outdoorCases };
