'use strict';

const assert = require('node:assert/strict');
const { advanceWorldTicks } = require('./yorkie-clock');

// Observe real movement, not goal internals. A small contact hop is normal;
// repeated circling or losing more than one block of height is not.
class ClimbRouteObservation {
  constructor(floorY) {
    this.floorY = floorY;
    this.distance = 0;
    this.largestDrop = 0;
    this.started = false;
  }

  sample(position) {
    assert(['x', 'y', 'z'].every(axis => Number.isFinite(position?.[axis])), 'Invalid squirrel position');
    if (!this.started && position.y >= this.floorY + 0.5) {
      this.started = true;
      this.peakY = position.y;
    }
    if (this.started) {
      if (this.previous) this.distance += Math.hypot(position.x - this.previous.x, position.z - this.previous.z);
      this.peakY = Math.max(this.peakY, position.y);
      this.largestDrop = Math.max(this.largestDrop, this.peakY - position.y);
    }
    this.previous = position;
  }

  assertSmooth() {
    assert(this.started, 'Squirrel never began its climb');
    assert(this.distance <= 3, `Squirrel circled during its climb: ${this.distance} horizontal blocks`);
    assert(this.largestDrop <= 1, `Squirrel lost its climb and dropped ${this.largestDrop} blocks`);
  }
}

function squirrelRouteCases({ prepare, command, request, state, base, check }) {
  const starts = [
    ['clear-tree-face', 3.5, 0.5], ['north-left', 2.8, 0.5], ['north-inner-left', 3.2, 0.5],
    ['north-inner-right', 3.8, 0.5], ['north-right', 4.2, 0.5], ['north-far-right', 4.5, 0.5],
    ['near-branch-right', 3.8, 1.5], ['near-branch-left', 3.2, 1.5]
  ];
  return starts.map(([label, x, z]) => {
    const inputs = { time: 1000, shelter: 'outside', hunger: 10, sitting: false, flying: false, squirrelOffset: { x, z } };
    return {
      name: `squirrel-${label}`, inspectionPet: false, inputs,
      setup: async () => {
        await prepare(inputs);
        await request('/clear-entities', { type: 'mushroom_yorkie:mushroom_yorkie' });
        await request('/clear-entities', { type: 'mushroom_yorkie:squirrel' });
        await command('tick freeze');
        await command(`fill ${base.x + 3} ${base.y} ${base.z + 3} ${base.x + 3} ${base.y + 4} ${base.z + 3} minecraft:oak_log`);
        await command(`setblock ${base.x + 3} ${base.y + 2} ${base.z + 2} minecraft:oak_leaves[persistent=true]`);
        await command(`summon mushroom_yorkie:squirrel ${base.x + x} ${base.y} ${base.z + z} {NoAI:1b,PersistenceRequired:1b}`);
        const squirrel = (await state()).players[0].nearbyEntities.find(e => e.type === 'mushroom_yorkie:squirrel');
        check(squirrel && squirrel.health === squirrel.maxHealth, 'Fresh healthy squirrel fixture is not observable');
        return { uuid: squirrel.uuid, position: squirrel.position };
      },
      run: async (fixture, result, save) => {
        await command(`data merge entity ${fixture.uuid} {NoAI:0b}`);
        const route = new ClimbRouteObservation(base.y);
        const observed = result.observed = { fixture, trace: [], route };
        let stableTicks = 0;
        for (let ticks = 1; ticks <= 400; ticks++) {
          const snapshot = await advanceWorldTicks(command, state, 1, 'step');
          const squirrel = snapshot.players[0].nearbyEntities.find(e => e.uuid === fixture.uuid);
          observed.trace.push({ ticks, squirrel, tickAudit: snapshot.tickAudit });
          save();
          check(snapshot.tickAudit.elapsedTicks === 1, 'Squirrel observation skipped native world ticks');
          check(squirrel && squirrel.health === squirrel.maxHealth, 'Tree approach lost or damaged the original squirrel');
          route.sample(squirrel.position);
          const clinging = squirrel.custom.foundTree && squirrel.noGravity && squirrel.position.y >= base.y + 3.8;
          if (clinging && observed.completedAtTicks === undefined) observed.completedAtTicks = ticks;
          stableTicks = clinging ? stableTicks + 1 : 0;
          if (stableTicks >= 40) {
            route.assertSmooth();
            return observed;
          }
        }
        throw new Error('Squirrel did not finish a healthy climb and remain clinging for 40 ticks within 400 ticks');
      },
      cleanup: () => command('tick unfreeze')
    };
  });
}

module.exports = { ClimbRouteObservation, squirrelRouteCases };
