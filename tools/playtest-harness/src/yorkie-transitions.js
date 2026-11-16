'use strict';

const { FETCH_TOYS } = require('./yorkie-inputs');

// Additional sequences share the matrix's disposable-save guard and fresh fixtures.
function transitionCases({ prepare, command, request, state, entity, advance, base, player, selector, check }) {
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const rows = [];
  const toys = (snapshot, item) => snapshot.players[0].nearbyEntities.filter((candidate) => candidate.type === 'minecraft:item' && candidate.item?.id === item);
  async function pickUp(item) {
    await command(`tp ${selector} ${base.x + 2.5} ${base.y} ${base.z + 0.5}`);
    await command(`tp ${player} ${base.x - 2.5} ${base.y} ${base.z + 0.5}`);
    await command(`summon minecraft:item ${base.x + 2.5} ${base.y} ${base.z + 0.5} {Item:{id:"${item}",count:1},PickupDelay:32767}`);
    for (let tick = 0; tick < 180; tick++) {
      await command('tick step 1t');
      await delay(100);
      const snapshot = await state();
      if (toys(snapshot, item).length === 0 && entity(snapshot)?.distance > 3
          && entity(snapshot)?.mainHand?.id === item && entity(snapshot)?.mainHand?.count === 1) return snapshot;
    }
    const error = new Error('Could not isolate the carried toy before delivery');
    error.phase = 'setup';
    throw error;
  }

  for (const item of FETCH_TOYS) {
    for (const interruption of ['sit', 'sleep']) {
      const inputs = { time: 1000, shelter: interruption === 'sleep' ? 'inside' : 'outside', hunger: 10, sitting: false, flying: false };
      rows.push({
        name: `fetch-${interruption}-${item.split(':')[1]}`, inputs,
        setup: async () => {
          await prepare(inputs);
          await request('/clear-entities', { type: 'minecraft:item' });
        },
        run: async (fixture, result) => {
          await command('tick freeze');
          try {
            const picked = await pickUp(item);
            result.observed = { picked };
            if (interruption === 'sit') await command(`data merge entity ${selector} {Sitting:1b}`);
            else await command('time set night');
            await command('tick step 12t');
            await delay(750);
            const after = await state();
            result.observed.after = after;
            const pet = entity(after);
            check(pet && (interruption === 'sit' ? pet.tameable.orderedToSit : pet.custom.curledUpSleeping), 'Requested interruption did not take effect');
            check(toys(after, item).reduce((count, toy) => count + toy.item.count, 0) === 1, 'Interrupted fetch lost or duplicated the toy');
            check(pet.mainHand?.id !== item || pet.mainHand.count === 0, 'Interrupted fetch retained a second carried copy');
            return result.observed;
          } finally { await command('tick unfreeze'); }
        }
      });
    }
  }
  for (const item of FETCH_TOYS) {
    const inputs = { time: 1000, shelter: 'outside', hunger: 10, sitting: false, flying: false, ownerMode: 'survival' };
    rows.push({
      name: `fetch-owner-mode-${item.split(':')[1]}`, inputs,
      setup: async () => {
        await prepare(inputs);
        await request('/command', { command: `clear ${player}` }, true);
      },
      run: async (fixture, result) => {
        await command('tick freeze');
        try {
          const picked = await pickUp(item);
          result.observed = { picked };
          const inventoryBefore = await request('/command', { command: `clear ${player} ${item} 0` }, true);
          check(inventoryBefore.result === 0, 'Mode-change fixture inventory was not empty');
          await command(`gamemode creative ${player}`);
          await command('tick unfreeze');
          const afterCreative = await advance(240);
          result.observed.afterCreative = afterCreative;
          await command(`gamemode survival ${player}`);
          const final = await state();
          const inventory = await request('/command', { command: `clear ${player} ${item} 0` }, true);
          const pet = entity(final);
          result.observed.final = final;
          result.observed.inventory = inventory.result;
          check(pet && pet.uuid === entity(picked).uuid, 'Carrier changed during the owner mode transition');
          check(inventory.result === 1 && toys(final, item).length === 0 && pet.mainHand?.id !== item,
            `Owner mode change lost or duplicated the real toy: inventory=${inventory.result}`);
          return result.observed;
        } finally { await command('tick unfreeze'); }
      }
    });
  }
  for (const hunger of [0, 90]) {
    const inputs = { time: 18000, shelter: 'inside', hunger, sitting: false, flying: false };
    rows.push({
      name: `sleep-flight-sleep-${hunger}`, inputs, setup: () => prepare(inputs),
      run: async (fixture, result) => {
        const sleeping = entity(await advance());
        result.observed = { sleeping };
        check(sleeping?.custom.curledUpSleeping, 'Pet never slept before takeoff');
        await command(`gamemode creative ${player}`);
        await request('/player-abilities', { player, flying: true, mayfly: true });
        await command(`tp ${player} ${base.x - 1.5} ${base.y + 1.5} ${base.z + 0.5}`);
        const flying = entity(await advance());
        result.observed.flying = flying;
        check(flying?.noGravity && !flying.custom.curledUpSleeping, 'Sleeping pet did not wake and follow owner flight');
        await request('/player-abilities', { player, flying: false, mayfly: true });
        await command(`tp ${player} ${base.x - 1.5} ${base.y} ${base.z + 0.5}`);
        const landed = entity(await advance());
        result.observed.landed = landed;
        check(landed && !landed.noGravity && landed.custom.curledUpSleeping, 'Pet did not settle back to night sleep after landing');
        return result.observed;
      }
    });
  }
  const nightCare = { time: 18000, shelter: 'inside', hunger: 100, sitting: false, flying: false };
  rows.push({
    name: 'starving-night-food-bowl', inputs: nightCare,
    setup: async () => {
      await prepare(nightCare);
      await command(`setblock ${base.x + 1} ${base.y} ${base.z} mushroom_yorkie:dog_food_bowl`);
    },
    run: async (fixture, result) => {
      const snapshot = await advance(620);
      const pet = entity(snapshot);
      result.observed = { snapshot };
      check(pet && pet.custom.needs.hunger < 100, 'Starving pet ignored the adjacent food bowl through the night');
      check(pet.health === pet.maxHealth, 'Pet took starvation damage despite available food');
      check(pet.custom.curledUpSleeping, 'Pet did not settle back to sleep after its urgent meal');
      const bowl = await request('/block', { x: base.x + 1, y: base.y, z: base.z });
      check(bowl.block === 'mushroom_yorkie:dog_bowl', 'Food bowl was not consumed');
      return { snapshot, bowl };
    }
  });
  const treeFace = { time: 1000, shelter: 'outside', hunger: 10, sitting: false, flying: false };
  rows.push({
    name: 'squirrel-clear-tree-face', inspectionPet: false, inputs: treeFace,
    setup: async () => {
      await prepare(treeFace);
      await request('/clear-entities', { type: 'mushroom_yorkie:mushroom_yorkie' });
      await request('/clear-entities', { type: 'mushroom_yorkie:squirrel' });
      await command(`fill ${base.x + 3} ${base.y} ${base.z + 3} ${base.x + 3} ${base.y + 4} ${base.z + 3} minecraft:oak_log`);
      await command(`setblock ${base.x + 3} ${base.y + 2} ${base.z + 2} minecraft:oak_leaves[persistent=true]`);
      await command(`summon mushroom_yorkie:squirrel ${base.x + 3.5} ${base.y} ${base.z + 0.5} {NoAI:1b,PersistenceRequired:1b}`);
      const squirrel = (await state()).players[0].nearbyEntities.find(e => e.type === 'mushroom_yorkie:squirrel');
      check(squirrel, 'Fresh squirrel fixture is not observable');
      return { uuid: squirrel.uuid };
    },
    run: async (fixture, result, save) => {
      await command('data merge entity @e[type=mushroom_yorkie:squirrel,limit=1] {NoAI:0b}');
      const observed = result.observed = { fixture, trace: [] };
      const find = snapshot => snapshot.players[0].nearbyEntities.find(e => e.uuid === fixture.uuid);
      let completed;
      for (let ticks = 20; ticks <= 400; ticks += 20) {
        const snapshot = await advance(20), squirrel = find(snapshot);
        observed.trace.push({ ticks, snapshot, squirrel });
        save();
        check(squirrel && squirrel.health === squirrel.maxHealth, 'Tree approach lost or damaged the original squirrel');
        if (squirrel.custom.foundTree && squirrel.position.y >= base.y + 3.8) {
          observed.completedAtTicks = ticks;
          completed = snapshot;
          break;
        }
      }
      check(completed, 'Squirrel did not finish a safe clear-face climb within 400 ticks');
      observed.settled = await advance(40);
      const clinging = find(observed.settled);
      check(clinging?.custom.foundTree && clinging.noGravity && clinging.health === clinging.maxHealth
        && clinging.position.y >= base.y + 3.8, 'Squirrel did not remain safely clinging after the clear-face climb');
      return observed;
    }
  });
  return rows;
}

module.exports = { transitionCases };
