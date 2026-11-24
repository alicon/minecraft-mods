'use strict';

const { setTimeout: sleep } = require('node:timers/promises');
const { assertLivingTestOwner } = require('./yorkie-world');

function readStageOwner(snapshot, identity) {
  assertLivingTestOwner(snapshot, identity.expectedSave);
  const owner = snapshot.players[0];
  if (owner.uuid !== identity.playerUuid || !owner.dimension.includes('minecraft:overworld')) {
    throw new Error('Matrix owner changed during staging');
  }
  return { tickCount: snapshot.tickCount, position: owner.positionPrecise ?? owner.position,
    velocity: owner.velocity, onGround: owner.onGround, inWater: owner.inWater,
    health: owner.health, flying: owner.abilities?.flying, vehicle: owner.vehicle, lastClientInput: owner.lastClientInput };
}

function stationaryOnFloor(owner, target) {
  const offset = Math.hypot(...['x', 'y', 'z'].map(axis => owner.position[axis] - target[axis]));
  return owner.onGround === true && !owner.inWater && !owner.flying && !owner.vehicle && offset <= 0.05
    && !Object.values(owner.lastClientInput ?? {}).some(Boolean);
}

async function settleStagingOwner(state, identity, target, { delay = sleep } = {}) {
  const staging = { target, samples: [] };
  let stable = 0;
  let previousTick = -1;
  try {
    // The server can already be at the target before the client has processed the teleport.
    await delay(150);
    for (let attempt = 0; attempt < 20; attempt++) {
      const owner = readStageOwner(await state(), identity);
      staging.samples.push(owner);
      if (!stationaryOnFloor(owner, target)) stable = 0;
      else if (Number.isSafeInteger(owner.tickCount) && owner.tickCount > previousTick) stable++;
      if (Number.isSafeInteger(owner.tickCount)) previousTick = Math.max(previousTick, owner.tickCount);
      if (stable === 3) return staging;
      await delay(50);
    }
    throw new Error('Matrix owner did not settle on the staging floor before the builder-focus reset');
  } catch (error) {
    error.observed ??= { ownerStaging: staging };
    throw error;
  }
}

function assertStagedOwnerAfterReset(snapshot, identity, staging) {
  try {
    const owner = staging.afterReset = readStageOwner(snapshot, identity);
    if (!stationaryOnFloor(owner, staging.target)) {
      throw new Error('Matrix owner was off the staging floor or had movement input after the builder-focus reset');
    }
    return owner;
  } catch (error) {
    error.observed ??= { ownerStaging: staging };
    throw error;
  }
}

module.exports = { settleStagingOwner, assertStagedOwnerAfterReset };
