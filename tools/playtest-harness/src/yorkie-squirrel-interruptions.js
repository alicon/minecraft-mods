'use strict';

const { advanceWorldTicks } = require('./yorkie-clock');

function squirrelInterruptionCases(context) {
  const { prepare, request, command, state, base, check } = context;
  return [false, true].map(closeFace => {
    const inputs = { time: 1000, shelter: 'outside', hunger: 10, sitting: false, flying: false, closeClimbingFace: closeFace };
    return {
      name: `squirrel-climbing-face-${closeFace ? 'closure' : 'open-control'}`, inspectionPet: false, inputs,
      setup: async () => {
        await prepare(inputs);
        await request('/clear-entities', { type: 'mushroom_yorkie:mushroom_yorkie' });
        await request('/clear-entities', { type: 'mushroom_yorkie:squirrel' });
        await command('tick freeze');
        await command(`fill ${base.x + 3} ${base.y} ${base.z + 3} ${base.x + 3} ${base.y + 4} ${base.z + 3} minecraft:oak_log`);
        await command(`summon mushroom_yorkie:squirrel ${base.x + 0.5} ${base.y} ${base.z + 3.5} {NoAI:1b,PersistenceRequired:1b}`);
        const snapshot = await state();
        check(snapshot.worldFrozen === true, 'Interruption fixture did not freeze');
        const squirrel = snapshot.players[0].nearbyEntities.find(e => e.type === 'mushroom_yorkie:squirrel');
        check(squirrel && squirrel.health === squirrel.maxHealth, 'Fresh interruption squirrel is missing');
        return { uuid: squirrel.uuid, expectedTree: { x: base.x + 3.5, z: base.z + 3.5 } };
      },
      run: async (fixture, result, save) => {
        const observed = result.observed = { fixture, trace: [] };
        await command(`data merge entity ${fixture.uuid} {NoAI:0b}`);
        let stableTicks = 0;
        for (let ticks = 1; ticks <= 300; ticks++) {
          const snapshot = await advanceWorldTicks(command, state, 1, 'step');
          const squirrel = snapshot.players[0].nearbyEntities.find(e => e.uuid === fixture.uuid);
          observed.trace.push({ ticks, squirrel, tickAudit: snapshot.tickAudit }); save();
          check(snapshot.worldFrozen === true && snapshot.tickAudit.elapsedTicks === 1, 'Interruption observation lost exact native ticks');
          check(squirrel && squirrel.health === squirrel.maxHealth, 'Interruption lost or damaged the original squirrel');
          if (observed.interruptedAt === undefined && squirrel.position.y >= base.y + 0.8 && squirrel.position.y < base.y + 1.3) {
            const p = squirrel.position;
            if (!(p.x < base.x + 3 && p.x > base.x + 2 && Math.abs(p.z - base.z - 3.5) < 0.2
              && p.y + 0.6 < base.y + 2 && !squirrel.noGravity && !squirrel.custom.foundTree)) {
              const error = new Error('Climbing-face change overlaps the squirrel or missed the west ascent');
              error.phase = 'setup'; throw error;
            }
            observed.interruptedAt = ticks; save();
            if (closeFace) await command(`setblock ${base.x + 2} ${base.y + 2} ${base.z + 3} minecraft:stone`);
          }
          const recovered = observed.interruptedAt !== undefined && squirrel.custom.foundTree && squirrel.noGravity
            && squirrel.position.y >= base.y + 3.8;
          stableTicks = recovered ? stableTicks + 1 : 0;
          if (recovered && observed.firstRecoveredAt === undefined) observed.firstRecoveredAt = ticks;
          if (stableTicks >= 40) {
            check(Math.hypot(squirrel.position.x - fixture.expectedTree.x, squirrel.position.z - fixture.expectedTree.z) < 1.5,
              'Interrupted squirrel clung to an unrelated tree');
            return observed;
          }
        }
        if (observed.interruptedAt === undefined) {
          const error = new Error('Interruption fixture never observed the intended native ascent');
          error.phase = 'setup'; throw error;
        }
        throw new Error('Squirrel failed to recover a stable perch after climbing-face interruption within 300 ticks');
      },
      cleanup: () => command('tick unfreeze')
    };
  });
}

module.exports = { squirrelInterruptionCases };
