'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { KnockbackObservation, squirrelKnockbackCases } = require('./yorkie-squirrel-knockback');

const hit = { uuid: 'original', health: 7, position: { x: 2.81, y: 23.9, z: 3.5 }, velocity: { x: 0.19, y: 0.196, z: 0.35 },
  onClimbable: true, hurtTime: 10, lastDamageType: 'player', noGravity: true, fallDistance: 0, custom: { foundTree: true } };
const before = { ...hit, velocity: { x: 0, y: 0, z: 0 } };
const source = { x: 2, y: 22, z: 2 };
const observe = (perched = true, actor = hit, prior = before) => new KnockbackObservation(actor, perched, prior, source);
const falling = { ...hit, position: { ...hit.position, x: 3.11, y: 23.5 }, onClimbable: false,
  noGravity: false, fallDistance: 0.4, custom: { foundTree: false } };

test('supplied impulse and eventual clinging cannot replace actual immediate movement', () => {
  const observation = observe();
  const still = { ...falling, position: hit.position };
  observation.sample(still, 1);
  assert.throws(() => observation.sample(still, 2), /immediately move away/);
  assert.throws(() => observation.assertReaction(), /cancelled/);
});

test('native landing damage retains health loss and requires ordinary fall distance for recovery', () => {
  const observation = observe();
  observation.sample(falling, 1);
  observation.sample({ ...falling, health: 6, position: { ...falling.position, y: 22 }, onGround: true, lastDamageType: 'fall' }, 2);
  observation.assertReaction();
  assert.equal(observation.fallHealthLoss, 1);
  assert.throws(() => observation.assertRecovery(), /fall distance/);
  observation.sample({ ...falling, health: 6, fallDistance: 3.5 }, 3);
  observation.assertRecovery();
  assert.throws(() => observation.sample({ ...falling, health: 7 }, 4), /gained health/);
});

test('unrelated damage or healing cannot be hidden in a recovered hurt scenario', () => {
  for (const changed of [{ health: 6, lastDamageType: 'player' }, { health: 8 }]) {
    const observation = observe();
    assert.throws(() => observation.sample({ ...falling, ...changed }, 1), /damage|gained health/);
  }
});

test('a teleport or substituted actor cannot prove native knockback', () => {
  assert.throws(() => observe().sample({ ...falling, position: { ...hit.position, x: 10 } }, 1), /jumped unexpectedly/);
  assert.throws(() => observe().sample({ ...falling, uuid: 'replacement' }, 1), /Original hit/);
});

test('missing impulse, preexisting velocity, inactive hurt or unclimbed setup cannot prove a hit', () => {
  assert.throws(() => observe(true, { ...hit, velocity: undefined }), /unavailable/);
  assert.throws(() => observe(true, { ...hit, velocity: { x: 0, y: 0, z: 0 } }), /did not supply/);
  assert.throws(() => observe(true, hit, hit), /add attacker-directed/);
  assert.throws(() => observe(true, { ...hit, hurtTime: 0 }), /active player hurt/);
  assert.throws(() => observe(true, hit, { ...before, onClimbable: false }), /observably climbing/);
});

test('mid-climb release requires the actual climb flag off and rejects extra landing damage', () => {
  assert.throws(() => observe(false).sample({ ...falling, onClimbable: true }, 1), /release climbing/);
  const observation = observe(false);
  observation.sample(falling, 1);
  assert.throws(() => observation.sample({ ...falling, health: 6, onGround: true, lastDamageType: 'fall' }, 2), /outside an observed/);
});

test('four native hurt cases retain both phases/directions and explicitly label command input', () => {
  const cases = squirrelKnockbackCases({});
  assert.equal(cases.length, 4); assert.equal(new Set(cases.map(c => c.name)).size, 4);
  assert(cases.every(c => c.inspectionPet === false && c.inputs.hitInput.includes('not a client swing') && typeof c.cleanup === 'function'));
});
