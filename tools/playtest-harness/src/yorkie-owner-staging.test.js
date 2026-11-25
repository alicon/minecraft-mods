'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { settleStagingOwner, assertStagedOwnerAfterReset } = require('./yorkie-owner-staging');

const identity = { expectedSave: 'Codex Staging Test', playerUuid: 'test-owner' };
const target = { x: -121.5, y: 220, z: 38.5 };
const delay = async () => {};

function snapshot(tickCount, player = {}) {
  return { tickCount, saveName: identity.expectedSave, singleplayer: true, players: [{
    uuid: identity.playerUuid, dimension: 'minecraft:overworld', health: 20, onGround: true,
    position: target, lastClientInput: {}, ...player
  }] };
}

test('staging waits through delayed teleport drift and requires three distinct supported ticks', async () => {
  const drifted = { ...target, z: target.z + 1 };
  const samples = [snapshot(3), snapshot(4, { positionPrecise: drifted }),
    snapshot(5), snapshot(5), snapshot(6), snapshot(7)];
  const waits = [];
  const staging = await settleStagingOwner(async () => samples.shift(), identity, target,
    { delay: async ms => waits.push(ms) });
  assert.deepEqual(staging.samples.map(owner => owner.tickCount), [3, 4, 5, 5, 6, 7]);
  assert.deepEqual(staging.samples[1].position, drifted);
  assert.deepEqual(waits, [150, 50, 50, 50, 50, 50]);
});

test('staging accepts the observed transition drift after the owner stops on the verified block', async () => {
  const positions = [-121.704286, -121.731415, -121.746227, -121.754314, -121.758730, -121.758730];
  const parked = { ...target, x: positions.at(-1) };
  let reads = 0;
  const staging = await settleStagingOwner(async () => snapshot(reads + 1, {
    positionPrecise: { ...target, x: positions[reads++] ?? parked.x }
  }), identity, target, { delay });
  assert.equal(staging.samples.length, 6);
  assert.deepEqual(assertStagedOwnerAfterReset(snapshot(1807, { positionPrecise: parked }), identity, staging).position, parked);
  assert.throws(() => assertStagedOwnerAfterReset(snapshot(1807, { positionPrecise: { ...parked, x: parked.x + 0.1 } }),
    identity, staging), /after the builder-focus reset/);
});

test('bounded staging preserves held input and cannot pass on a stationary server tick', async () => {
  for (const [state, input] of [[() => snapshot(3), {}], [n => snapshot(n, { lastClientInput: { forward: true } }), { forward: true }]]) {
    let reads = 0;
    await assert.rejects(settleStagingOwner(async () => state(++reads), identity, target, { delay }), error => {
      assert.match(error.message, /before the builder-focus reset/);
      assert.equal(error.observed.ownerStaging.samples.length, 20);
      assert.deepEqual(error.observed.ownerStaging.samples.at(-1).lastClientInput, input);
      return true;
    });
  }
});

test('post-reset staging retains position and input evidence when the owner has drifted', async () => {
  let tick = 0;
  const staging = await settleStagingOwner(async () => snapshot(++tick), identity, target, { delay });
  const position = { ...target, z: target.z + 1 };
  assert.throws(() => assertStagedOwnerAfterReset(snapshot(1804, { position, lastClientInput: { right: true } }),
    identity, staging), error => {
    assert.match(error.message, /after the builder-focus reset/);
    assert.deepEqual(error.observed.ownerStaging.afterReset.position, position);
    assert.deepEqual(error.observed.ownerStaging.afterReset.lastClientInput, { right: true });
    assert.equal(error.observed.ownerStaging.samples.length, 3);
    return true;
  });
  assert.deepEqual(assertStagedOwnerAfterReset(snapshot(1804), identity, staging).position, target);
});
