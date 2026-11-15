'use strict';

const { OWNER_STATES, FETCH_TOYS } = require('./yorkie-inputs');

function terrainInputs() {
  return FETCH_TOYS.flatMap((item) => OWNER_STATES.flatMap((owner) =>
    ['dry', 'open-water', 'covered-water', 'cliff'].map((layout) => ({
      item, ...owner, layout, time: 1000, shelter: 'outside', hunger: 0, sitting: false,
      expected: layout === 'covered-water' || layout === 'cliff' && owner.ownerMode === 'survival'
        ? 'refused' : layout === 'cliff' && !owner.flying ? 'safe-outcome' : 'returned'
    }))));
}

function terrainCases({ prepare, command, request, state, entity, advance, base, player, selector, check }) {
  const itemEntities = (snapshot, item) => snapshot.players[0].nearbyEntities.filter((candidate) =>
    candidate.type === 'minecraft:item' && candidate.item?.id === item);
  const inventory = async (item) => (await request('/command', { command: `clear ${player} ${item} 0` }, true)).result;
  async function block(x, y, z, expected) {
    const actual = await request('/block', { x, y, z });
    check(actual.block === expected, `Terrain fixture expected ${expected}, observed ${actual.block}`);
  }

  return terrainInputs().map((inputs) => ({
    name: `terrain-${inputs.layout}-${inputs.ownerMode}-${inputs.flying ? 'flying' : 'walking'}-${inputs.item.split(':')[1]}`,
    inputs,
    setup: async () => {
      const prepared = await prepare(inputs);
      await command('tick freeze');
      await request('/command', { command: `clear ${player}` }, true);
      // Reset underground water/pit remnants too; the base matrix resets only the arena above its floor.
      await command(`fill ${base.x - 7} ${base.y - 8} ${base.z - 7} ${base.x + 7} ${base.y - 2} ${base.z + 7} minecraft:air`);
      await command(`tp ${selector} ${base.x + 0.5} ${base.y} ${base.z + 0.5}`);
      await command(`tp ${player} ${base.x - 2.5} ${base.y + (inputs.flying ? 1.5 : 0)} ${base.z + 0.5}`);
      await command(`data merge entity ${selector} {Hunger:0,Potty:0,Mood:60,Energy:80}`);
      let toyY = base.y;
      if (inputs.layout === 'open-water') {
        await command(`setblock ${base.x + 5} ${base.y - 2} ${base.z + 2} minecraft:stone`);
        await command(`setblock ${base.x + 5} ${base.y - 1} ${base.z + 2} minecraft:water`);
        await block(base.x + 5, base.y - 1, base.z + 2, 'minecraft:water');
        toyY -= 0.2;
      } else if (inputs.layout === 'covered-water') {
        await command(`fill ${base.x + 4} ${base.y - 1} ${base.z + 1} ${base.x + 6} ${base.y + 2} ${base.z + 3} minecraft:glass hollow`);
        await command(`setblock ${base.x + 5} ${base.y + 1} ${base.z + 2} minecraft:glass`);
        await command(`setblock ${base.x + 5} ${base.y} ${base.z + 2} minecraft:water`);
        await block(base.x + 5, base.y + 1, base.z + 2, 'minecraft:glass');
        await block(base.x + 5, base.y, base.z + 2, 'minecraft:water');
        toyY += 0.1;
      } else if (inputs.layout === 'cliff') {
        await command(`fill ${base.x + 4} ${base.y - 6} ${base.z + 1} ${base.x + 6} ${base.y - 1} ${base.z + 3} minecraft:air`);
        await command(`fill ${base.x + 4} ${base.y - 7} ${base.z + 1} ${base.x + 6} ${base.y - 7} ${base.z + 3} minecraft:stone`);
        await block(base.x + 5, base.y - 1, base.z + 2, 'minecraft:air');
        await block(base.x + 5, base.y - 7, base.z + 2, 'minecraft:stone');
        toyY -= 6;
      }
      await command(`summon minecraft:item ${base.x + 5.5} ${toyY} ${base.z + 2.5} {Item:{id:"${inputs.item}",count:1},PickupDelay:32767}`);
      const snapshot = await state();
      snapshot.fixtureAudit = prepared.fixtureAudit;
      check(itemEntities(snapshot, inputs.item).reduce((sum, toy) => sum + toy.item.count, 0) === 1
        && await inventory(inputs.item) === 0 && entity(snapshot)?.mainHand.empty, 'Terrain toy fixture was not isolated');
      return snapshot;
    },
    run: async (fixture, result) => {
      result.observed = { fixture, trace: [] };
      const original = entity(fixture);
      await command('tick unfreeze');
      let snapshot;
      let counts;
      for (let ticks = 20; ticks <= 800; ticks += 20) {
        snapshot = await advance(20);
        const pet = entity(snapshot);
        const ground = itemEntities(snapshot, inputs.item).reduce((sum, toy) => sum + toy.item.count, 0);
        const held = pet?.mainHand?.id === inputs.item ? pet.mainHand.count : 0;
        counts = { inventory: await inventory(inputs.item), ground, held };
        result.observed.trace.push({ ticks, counts, pet });
        check(pet && pet.uuid === original.uuid, 'Original Mushroom left the observation area or disappeared');
        check(pet.health >= original.health, `Fetch damaged Mushroom: health ${original.health} -> ${pet.health}`);
        check(counts.inventory + ground + held === 1, `Visible toy conservation failed: ${JSON.stringify(counts)}`);
        if (counts.inventory === 1) break;
      }
      result.observed.final = snapshot;
      result.observed.counts = counts;
      const pet = entity(snapshot);
      const returned = counts.inventory === 1 && counts.ground === 0 && counts.held === 0;
      const refused = counts.inventory === 0 && counts.ground === 1 && counts.held === 0 && pet.distance <= 3;
      check(inputs.expected === 'returned' ? returned : inputs.expected === 'refused' ? refused : returned || refused,
        `Expected ${inputs.expected}, observed ${JSON.stringify(counts)}, owner distance=${pet.distance}`);
      check(returned ? pet.custom.needs.mood >= 74 && pet.custom.needs.mood < 88 : pet.custom.needs.mood < 74,
        `Unexpected play reward for ${returned ? 'returned' : 'refused'} fetch: ${JSON.stringify(pet.custom.needs)}`);
      // Verify that completion does not immediately replay pickup/reward or lose the item.
      const settled = await advance(40);
      result.observed.settled = settled;
      const settledGround = itemEntities(settled, inputs.item).reduce((sum, toy) => sum + toy.item.count, 0);
      check(await inventory(inputs.item) === counts.inventory && settledGround === counts.ground
        && entity(settled)?.mainHand?.id !== inputs.item, 'Fetch outcome changed after settling');
      check(entity(settled).custom.needs.mood < (returned ? 88 : 74), 'Fetch replayed its play reward after settling');
      return result.observed;
    },
    cleanup: () => command('tick unfreeze')
  }));
}

module.exports = { terrainInputs, terrainCases };
