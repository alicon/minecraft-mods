'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { KnockbackObservation, squirrelKnockbackCases } = require('./yorkie-squirrel-knockback');

const hit = { uuid: 'original', health: 7, position: { x: 2.81, y: 23.9, z: 3.5 }, velocity: { x: 0.19, y: 0.196, z: 0.35 },
  noGravity: true, fallDistance: 0, custom: { foundTree: true } };

test('a supplied native impulse that never moves cannot pass on eventual clinging alone', () => {
  const observation = new KnockbackObservation(hit, true);
  for (let tick = 1; tick < 10; tick++) observation.sample(hit, tick);
  assert.throws(() => observation.sample(hit, 10), /cancelled/);
});

test('a real released fall permits ordinary landing damage and retains the health loss', () => {
  const observation = new KnockbackObservation(hit, true);
  const falling = { ...hit, position: { ...hit.position, x: 3.11, y: 23.5 }, noGravity: false, fallDistance: 0.4, custom: { foundTree: false } };
  observation.sample(falling, 1);
  observation.sample({ ...falling, health: 6, position: { ...falling.position, y: 22 }, onGround: true, lastDamageType: 'fall' }, 2);
  observation.assertReaction();
  assert.equal(observation.fallHealthLoss, 1);
  assert.equal(observation.released, true);
  assert.throws(() => observation.sample({ ...falling, health: 7 }, 3), /gained health/);
});

test('unrelated damage or healing cannot be hidden in a recovered hurt scenario', () => {
  for (const changed of [{ health: 6, lastDamageType: 'player' }, { health: 8 }]) {
    const observation = new KnockbackObservation(hit, true);
    assert.throws(() => observation.sample({ ...hit, ...changed }, 1), /damage|gained health/);
  }
});

test('a teleport or substituted actor cannot prove native knockback', () => {
  assert.throws(() => new KnockbackObservation(hit, true).sample({ ...hit, position: { ...hit.position, x: 10 } }, 1), /jumped unexpectedly/);
  assert.throws(() => new KnockbackObservation(hit, true).sample({ ...hit, uuid: 'replacement' }, 1), /Original hit/);
});

test('missing or absent impulse evidence rejects the hit setup', () => {
  assert.throws(() => new KnockbackObservation({ ...hit, velocity: undefined }, true), /unavailable/);
  assert.throws(() => new KnockbackObservation({ ...hit, velocity: { x: 0, y: 0, z: 0 } }, true), /did not supply/);
});

test('a low mid-climb hit still rejects unexpected extra fall damage', () => {
  const observation = new KnockbackObservation(hit, false);
  const falling = { ...hit, noGravity: false, fallDistance: 1, custom: { foundTree: false } };
  observation.sample(falling, 1);
  assert.throws(() => observation.sample({ ...falling, health: 6, onGround: true, lastDamageType: 'fall' }, 2), /outside an observed/);
});

test('four native hurt cases retain both phases/directions and explicitly label command input', () => {
  const cases = squirrelKnockbackCases({});
  assert.equal(cases.length, 4); assert.equal(new Set(cases.map(c => c.name)).size, 4);
  assert(cases.every(c => c.inspectionPet === false && c.inputs.hitInput.includes('not a client swing') && typeof c.cleanup === 'function'));
});
