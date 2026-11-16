'use strict';

const { observeSquirrelClimb } = require('./yorkie-squirrel-routes');

function squirrelReachabilityCases(context) {
  const { prepare, request, command, state, base, check } = context;
  const layouts = [
    ['reachable-alternative', 'enclosed'], ['open-near-control', 'open'],
    ['far-only-control', 'far-only'], ['route-closure', 'close-later'], ['reachable-other-face', 'blocked-face']
  ];
  async function enclose() {
    for (const [x1, z1, x2, z2] of [[1, 1, 1, 5], [5, 1, 5, 5], [1, 1, 5, 1], [1, 5, 5, 5]]) {
      await command(`fill ${base.x + x1} ${base.y} ${base.z + z1} ${base.x + x2} ${base.y + 6} ${base.z + z2} minecraft:stone`);
    }
  }
  return layouts.map(([name, layout]) => {
    const inputs = { time: 1000, shelter: 'outside', hunger: 10, sitting: false, flying: false, treeLayout: layout };
    return {
      name: `squirrel-${name}`, inspectionPet: false, inputs,
      setup: async () => {
        await prepare(inputs);
        await request('/clear-entities', { type: 'mushroom_yorkie:mushroom_yorkie' });
        await request('/clear-entities', { type: 'mushroom_yorkie:squirrel' });
        await command('tick freeze');
        if (layout !== 'far-only') await command(`fill ${base.x + 3} ${base.y} ${base.z + 3} ${base.x + 3} ${base.y + 4} ${base.z + 3} minecraft:oak_log`);
        if (layout !== 'blocked-face') await command(`fill ${base.x} ${base.y} ${base.z - 1} ${base.x} ${base.y + 4} ${base.z - 1} minecraft:oak_log`);
        if (layout === 'enclosed') await enclose();
        if (layout === 'blocked-face') {
          await command(`fill ${base.x + 1} ${base.y} ${base.z + 2} ${base.x + 1} ${base.y + 6} ${base.z + 4} minecraft:stone`);
          for (const z of [2, 4]) await command(`fill ${base.x + 2} ${base.y} ${base.z + z} ${base.x + 2} ${base.y + 6} ${base.z + z} minecraft:stone`);
        }
        const x = base.x + (layout === 'close-later' ? -0.5 : 0.5);
        await command(`summon mushroom_yorkie:squirrel ${x} ${base.y} ${base.z + 3.5} {NoAI:1b,PersistenceRequired:1b}`);
        const snapshot = await state();
        check(snapshot.worldFrozen === true, 'Reachability fixture world did not freeze');
        const squirrel = snapshot.players[0].nearbyEntities.find(e => e.type === 'mushroom_yorkie:squirrel');
        check(squirrel && squirrel.health === squirrel.maxHealth, 'Fresh healthy reachability squirrel is missing');
        check(Math.abs(squirrel.position.x - x) < 0.01 && Math.abs(squirrel.position.y - base.y) < 0.01
          && Math.abs(squirrel.position.z - base.z - 3.5) < 0.01, 'Fresh squirrel is outside its authored approach position');
        const near = layout === 'open' || layout === 'blocked-face';
        return { uuid: squirrel.uuid, position: squirrel.position, expectedTree: near
          ? { x: base.x + 3.5, z: base.z + 3.5 } : { x: base.x + 0.5, z: base.z - 0.5 } };
      },
      run: (fixture, result, save) => observeSquirrelClimb(context, fixture, result, save, async (ticks, squirrel) => {
        if (layout !== 'close-later' || ticks !== 4) return;
        // The known 0.38-block squirrel body must remain entirely outside the wall.
        const startedNearApproach = squirrel.position.x > base.x - 0.4 && squirrel.position.x + 0.2 < base.x + 1
          && Math.abs(squirrel.position.y - base.y) < 0.01 && Math.abs(squirrel.position.z - base.z - 3.5) < 0.1;
        if (!startedNearApproach || squirrel.noGravity || squirrel.custom.foundTree) {
          const error = new Error('Route-closure fixture did not isolate an unobstructed native ground approach');
          error.phase = 'setup'; throw error;
        }
        result.observed.closureRequestedAtTicks = ticks;
        await enclose();
        result.observed.closedAtTicks = ticks;
        save();
      }),
      cleanup: () => command('tick unfreeze')
    };
  });
}

function squirrelStepCases(context) {
  const { prepare, request, command, state, base, player, check } = context;
  return [5, 6, 7].map(stepX => {
    const inputs = { time: 1000, shelter: 'outside', hunger: 10, sitting: false, flying: false, ownerMode: 'creative', stepX };
    return {
      name: `squirrel-step-${stepX}`, inspectionPet: false, inputs,
      setup: async () => {
        await prepare(inputs);
        await request('/clear-entities', { type: 'mushroom_yorkie:mushroom_yorkie' });
        await request('/clear-entities', { type: 'mushroom_yorkie:squirrel' });
        await command('tick freeze');
        // Keep the owner outside the raised strip before adding solid blocks.
        await command(`tp ${player} ${base.x - 6.5} ${base.y} ${base.z + 4.5}`);
        await command(`fill ${base.x + stepX - 7} ${base.y} ${base.z - 7} ${base.x + 3} ${base.y} ${base.z + 7} minecraft:stone`);
        await command(`fill ${base.x + 5} ${base.y} ${base.z} ${base.x + 5} ${base.y + 4} ${base.z} minecraft:oak_log`);
        await command(`summon mushroom_yorkie:squirrel ${base.x - 4.5} ${base.y} ${base.z + 0.5} {NoAI:1b,PersistenceRequired:1b}`);
        const snapshot = await state();
        check(snapshot.worldFrozen === true, 'Stepped fixture world did not freeze');
        const squirrel = snapshot.players[0].nearbyEntities.find(e => e.type === 'mushroom_yorkie:squirrel');
        check(squirrel && squirrel.health === squirrel.maxHealth && Math.abs(squirrel.position.x - base.x + 4.5) < 0.01
          && Math.abs(squirrel.position.y - base.y) < 0.01 && Math.abs(squirrel.position.z - base.z - 0.5) < 0.01,
        'Fresh stepped-route squirrel is missing or outside its authored position');
        return { uuid: squirrel.uuid, position: squirrel.position, expectedTree: { x: base.x + 5.5, z: base.z + 0.5 } };
      },
      run: async (fixture, result, save) => {
        const observed = await observeSquirrelClimb(context, fixture, result, save, async (ticks, squirrel) => {
          if (!squirrel.onGround && squirrel.position.y > base.y + 0.2 && squirrel.position.x < base.x + 4) {
            result.observed.airborneOnApproach = (result.observed.airborneOnApproach || 0) + 1;
          }
        });
        check(observed.airborneOnApproach > 0, 'Stepped route did not observe a real airborne ground approach');
        return observed;
      },
      cleanup: () => command('tick unfreeze')
    };
  });
}

module.exports = { squirrelReachabilityCases, squirrelStepCases };
