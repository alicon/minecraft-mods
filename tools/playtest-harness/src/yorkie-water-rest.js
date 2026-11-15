'use strict';

const { OWNER_STATES } = require('./yorkie-inputs');

function waterRestInputs() {
  const rows = [];
  for (const time of [1000, 18000])
    for (const hunger of [0, 90])
      for (const requestSit of [false, true])
        for (const owner of OWNER_STATES.filter((state) => !state.flying))
          rows.push({ time, hunger, requestSit, ...owner, shelter: 'inside', sitting: false, energy: 80, buildNap: false });
  for (const energy of [0, 80]) rows.push({ time: 1000, hunger: 0, requestSit: false, ownerMode: 'creative', flying: false, shelter: 'inside', sitting: false, energy, buildNap: true });
  for (const time of [1000, 18000])
    for (const owner of OWNER_STATES.filter((state) => !state.flying))
      rows.push({ time, hunger: 0, potty: 100, requestSit: false, ...owner, shelter: 'inside', sitting: false, energy: 80, buildNap: false });
  return rows;
}

function waterRestCases({ prepare, command, request, entity, advance, base, player, selector, check }) {
  return waterRestInputs().map((inputs) => ({
    name: inputs.buildNap ? `water-builder-nap-energy-${inputs.energy}`
      : `water-${inputs.time === 1000 ? 'day' : 'night'}-${inputs.ownerMode}-${inputs.hunger === 0 ? 'fed' : 'hungry'}-${inputs.requestSit ? 'sit' : 'follow'}${inputs.potty ? '-urgent-potty' : ''}`,
    inputs,
    setup: async () => {
      const prepared = await prepare(inputs);
      // Solid banks keep the pool contained below the otherwise one-block arena floor.
      await command(`fill ${base.x} ${base.y - 4} ${base.z - 2} ${base.x + 4} ${base.y - 1} ${base.z + 2} minecraft:stone`);
      await command(`fill ${base.x + 1} ${base.y - 3} ${base.z - 1} ${base.x + 3} ${base.y - 1} ${base.z + 1} minecraft:water`);
      await command(`tp ${player} ${base.x - 0.5} ${base.y} ${base.z + 0.5}`);
      await request('/command', { command: `data merge entity ${selector} {Hunger:${inputs.hunger},Potty:0,Energy:${inputs.energy},Health:12.0f}` }, true);
      for (const [x, y, z, expected] of [
        [base.x + 2, base.y - 2, base.z, 'minecraft:water'],
        [base.x + 2, base.y - 4, base.z, 'minecraft:stone'],
        [base.x, base.y - 2, base.z, 'minecraft:stone'],
        [base.x + 2, base.y, base.z, 'minecraft:air']
      ]) {
        const block = await request('/block', { x, y, z });
        check(block.block === expected, `Pool fixture expected ${expected}, observed ${block.block}`);
      }
      const building = [];
      if (inputs.buildNap) {
        for (const dz of [-3, -2, -1]) {
          const placed = await request('/use-block', { x: base.x - 3, y: base.y - 1, z: base.z + dz, face: 'up', item: 'minecraft:oak_planks', count: 1 });
          building.push(placed);
          check(placed.consumed, 'Creative building fixture did not consume its placement action');
          const block = await request('/block', { x: base.x - 3, y: base.y, z: base.z + dz });
          check(block.block === 'minecraft:oak_planks', 'Creative placement did not produce its block');
        }
        await command(`item replace entity ${player} weapon.mainhand with minecraft:air`);
      }
      const rested = await advance(inputs.buildNap ? 760 : 40);
      check(entity(rested)?.custom.curledUpSleeping === (inputs.time === 18000 || inputs.buildNap), 'Initial night-sleep/creative-nap state was not established');
      check(typeof entity(rested)?.custom.relief?.tripActive === 'boolean', 'Bridge does not expose outdoor-trip diagnostics');
      // Establish sleep first; urgent need must not change the routine solely because recovery prevents sleep.
      if (inputs.potty) await command(`data merge entity ${selector} {Potty:${inputs.potty}}`);
      await command(`tp ${selector} ${base.x + 2.5} ${base.y - 2.8} ${base.z + 0.5}`);
      const wet = await advance(3);
      check(entity(wet)?.inWater, 'Pool fixture did not actually submerge Mushroom');
      return { prepared, building, rested, wet, fixtureAudit: prepared.fixtureAudit };
    },
    run: async (fixture, result) => {
      result.observed = { fixture, trace: [] };
      const original = entity(fixture.wet);
      check(!original.custom.curledUpSleeping && !original.tameable.sittingPose, 'Submerged pet retained sleep/rest pose');
      if (inputs.time === 18000) check(original.custom.relief?.tripActive === false, 'Nighttime water entry started an unrelated outside trip');
      if (inputs.requestSit) result.observed.interaction = await request('/use-entity', {
        type: 'mushroom_yorkie:mushroom_yorkie', radius: 16, item: 'minecraft:air', count: 1
      });
      // After a reachable wet interaction, the owner steps farther onto the bank.
      // A brief airborne hop above the pool is not a completed return to dry land.
      // A safe night rest on the bank can begin before the ordinary follow distance is reached.
      await command(`tp ${player} ${base.x - 2.5} ${base.y} ${base.z + 0.5}`);
      let recovered;
      for (let ticks = 20; ticks <= 400; ticks += 20) {
        const snapshot = await advance(20);
        const pet = entity(snapshot);
        result.observed.trace.push({ ticks, pet });
        check(pet?.uuid === original.uuid, 'Water recovery lost or replaced the pet');
        check(pet.health >= original.health && pet.health === pet.maxHealth, 'Water recovery damaged Mushroom');
        check(!pet.tameable.orderedToSit, 'Wet sit request left a persistent sit order');
        if (pet.custom.curledUpSleeping) check(pet.onGround, 'Pet started sleeping before landing');
        if (pet.inWater) check(!pet.custom.curledUpSleeping && !pet.tameable.sittingPose, 'Wet pet sat or slept instead of recovering');
        if (inputs.time === 18000) check(pet.custom.relief?.tripActive === false, 'Nighttime recovery started an unrelated outside trip');
        if (!pet.inWater && pet.distance < 4 && pet.onGround && pet.position.x < base.x + 1 && Math.abs(pet.position.y - base.y) < 0.3) { recovered = snapshot; break; }
      }
      check(recovered, 'Mushroom did not leave the reachable pool for his owner');
      result.observed.recovered = recovered;
      const landed = entity(recovered);
      const underfoot = await request('/block', { x: Math.floor(landed.position.x), y: Math.floor(landed.position.y - 0.05), z: Math.floor(landed.position.z) });
      result.observed.underfoot = underfoot;
      check(['minecraft:stone', 'minecraft:oak_planks'].includes(underfoot.block), 'Recovery did not reach the solid bank/room floor');
      const settled = await advance(60);
      const pet = entity(settled);
      result.observed.settled = settled;
      check(pet?.uuid === original.uuid && !pet.inWater && pet.health === pet.maxHealth, 'Pet did not remain safe and dry after recovery');
      check(pet.custom.curledUpSleeping === (inputs.time === 18000 || inputs.buildNap), 'Dry sleep/nap did not resume at the appropriate time');
      check(pet.onGround && !pet.noGravity && !pet.tameable.orderedToSit, 'Water recovery did not land or retained flight/a refused sit order');
      return result.observed;
    }
  }));
}

module.exports = { waterRestInputs, waterRestCases };
