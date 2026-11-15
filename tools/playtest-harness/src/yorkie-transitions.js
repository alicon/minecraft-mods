'use strict';

// Additional sequences share the matrix's disposable-save guard and fresh fixtures.
function transitionCases({ prepare, command, request, state, entity, advance, base, player, selector, check }) {
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const rows = [];
  for (const item of ['minecraft:bone', 'mushroom_yorkie:yorkie_ball', 'mushroom_yorkie:yorkie_chew_toy']) {
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
            await command(`tp ${selector} ${base.x + 2.5} ${base.y} ${base.z + 0.5}`);
            await command(`tp ${player} ${base.x - 2.5} ${base.y} ${base.z + 0.5}`);
            await command(`summon minecraft:item ${base.x + 2.5} ${base.y} ${base.z + 0.5} {Item:{id:"${item}",count:1},PickupDelay:32767}`);
            const toys = (snapshot) => snapshot.players[0].nearbyEntities.filter((candidate) => candidate.type === 'minecraft:item' && candidate.item?.id === item);
            let picked;
            for (let tick = 0; tick < 180; tick++) {
              await command('tick step 1t');
              await delay(100);
              const snapshot = await state();
              if (toys(snapshot).length === 0 && entity(snapshot)?.distance > 2.5) { picked = snapshot; break; }
            }
            if (!picked) {
              const error = new Error('Could not isolate the carried toy before delivery');
              error.phase = 'setup';
              throw error;
            }
            result.observed = { picked };
            if (interruption === 'sit') await command(`data merge entity ${selector} {Sitting:1b}`);
            else await command('time set night');
            await command('tick step 12t');
            await delay(750);
            const after = await state();
            result.observed.after = after;
            const pet = entity(after);
            check(pet && (interruption === 'sit' ? pet.tameable.orderedToSit : pet.custom.curledUpSleeping), 'Requested interruption did not take effect');
            check(toys(after).reduce((count, toy) => count + toy.item.count, 0) === 1, 'Interrupted fetch lost or duplicated the toy');
            return result.observed;
          } finally { await command('tick unfreeze'); }
        }
      });
    }
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
  return rows;
}

module.exports = { transitionCases };
