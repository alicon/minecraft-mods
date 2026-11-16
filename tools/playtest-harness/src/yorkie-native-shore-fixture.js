'use strict';

const assert = require('node:assert/strict');
const WALK_TICKS = 80;
const SETTLE_TICKS = 120;
const volume = r => (r.x2 - r.x1 + 1) * (r.y2 - r.y1 + 1) * (r.z2 - r.z1 + 1);

function shoreGeometry(base) {
  assert(['x', 'y', 'z'].every(k => Number.isInteger(base[k])) && base.y >= -62 && base.y <= 316, 'Invalid shore fixture origin');
  // This generous run-out covers 0.5 blocks per walking tick plus four blocks.
  // Runtime bounds also cancel input before an owner can reach a platform edge.
  const endZ = base.z + Math.ceil(WALK_TICKS * 0.5) + 4;
  const floor = { x1: base.x - 7, y1: base.y - 1, z1: base.z + 4, x2: base.x + 7, y2: base.y - 1, z2: endZ };
  const headroom = { ...floor, y1: base.y, y2: base.y + 2 };
  const bottom = { x1: base.x - 2, y1: base.y - 2, z1: base.z - 3, x2: base.x + 2, y2: base.y - 2, z2: base.z + 2 };
  const ramp = { x1: base.x - 2, y1: base.y - 1, z1: base.z + 3, x2: base.x + 2, y2: base.y - 1, z2: base.z + 3 };
  const clear = [];
  const span = Math.min(20, Math.floor(32768 / (15 * (320 - base.y))));
  for (let z = base.z + 8; z <= endZ; z += span) {
    clear.push({ x1: base.x - 7, y1: base.y, z1: z, x2: base.x + 7, y2: 319, z2: Math.min(endZ, z + span - 1) });
  }
  return { base, endZ, floor, headroom, bottom, ramp, clear };
}

function assertShoreAudit(geometry, audit) {
  for (const [name, block] of [['floor', 'minecraft:grass_block'], ['headroom', 'minecraft:air'], ['bottom', 'minecraft:stone'], ['ramp', 'minecraft:stone_slab']]) {
    const observed = audit[name], expected = volume(geometry[name]);
    assert(observed?.volume === expected && observed.counts?.[block] === expected, `Unsafe shore ${name}: required ${expected} ${block} blocks`);
  }
  assert(/(?:\[|,)type=bottom(?:,|\])/.test(audit.rampState?.state || ''), 'Shore bank requires a bottom slab');
}

function assertOwnerInShore(snapshot, geometry) {
  const p = snapshot.players[0].position, b = geometry.base;
  assert(p && p.x >= b.x - 6 && p.x <= b.x + 6 && p.z >= b.z - 6 && p.z <= geometry.endZ - 1
    && p.y >= b.y - 1.1 && p.y <= b.y + 1, 'Owner approached the shore fixture boundary; cancel native input');
}

async function buildShoreBank(context) {
  const { base, command, request } = context;
  const geometry = shoreGeometry(base);
  const fill = (r, block) => command(`fill ${r.x1} ${r.y1} ${r.z1} ${r.x2} ${r.y2} ${r.z2} ${block}`);
  for (const region of geometry.clear) await fill(region, 'minecraft:air');
  await fill(geometry.floor, 'minecraft:grass_block');
  await command(`fill ${base.x - 3} ${base.y - 2} ${base.z - 4} ${base.x + 3} ${base.y - 1} ${base.z + 4} minecraft:stone`);
  await command(`fill ${base.x - 2} ${base.y - 1} ${base.z - 3} ${base.x + 2} ${base.y - 1} ${base.z + 3} minecraft:water`);
  await fill(geometry.ramp, 'minecraft:stone_slab[type=bottom]');
  // The shallow pool construction overlaps the first dry-bank row; restore it.
  await fill(geometry.floor, 'minecraft:grass_block');
  const audit = {};
  for (const name of ['floor', 'headroom', 'bottom', 'ramp']) audit[name] = await request('/count-blocks', geometry[name]);
  audit.rampState = await request('/block', { x: base.x, y: base.y - 1, z: base.z + 3 });
  assertShoreAudit(geometry, audit);
  return { geometry, audit };
}

function assertShoreEndpoint({ pet, owner, footBlock, ownerFootBlock, initialSit, sawWet }) {
  assert(pet && pet.health === pet.maxHealth && pet.health > 0 && pet.custom?.harness, 'Shore endpoint lost pet health or harness');
  assert(Number.isFinite(pet.air) && pet.air > 0, 'Shore endpoint has no air evidence');
  assert(pet.tameable?.orderedToSit === (initialSit && !sawWet), 'Shore endpoint changed the expected wet/dry order');
  assert(ownerFootBlock?.block === 'minecraft:grass_block', 'Owner did not finish on the checked dry bank');
  const mustFollow = !initialSit || sawWet;
  const drySupported = pet.inWater === false && pet.onGround === true && !pet.vehicle
    && ['minecraft:grass_block', 'minecraft:stone_slab'].includes(footBlock?.block);
  if (mustFollow) {
    assert(drySupported, 'Following pet did not reach dry block support');
    const distance = Math.hypot(...['x', 'y', 'z'].map(k => pet.position?.[k] - owner?.position?.[k]));
    assert(Number.isFinite(distance) && distance < 4, 'Following pet did not return near its original owner');
    assert(Math.hypot(pet.position.x - owner.position.x, pet.position.y - owner.position.y, pet.position.z - owner.position.z) < 4,
      'Recovered pet did not return near the owner');
  }
  return { mustFollow, drySupported };
}

function assertStableShore(frames, { petUuid, initialSit, sawWet }) {
  assert(frames.length === 40, 'Shore recovery requires 40 final native world samples');
  const mustFollow = !initialSit || sawWet;
  for (const [i, snapshot] of frames.entries()) {
    assert(snapshot.worldFrozen === true && snapshot.tickAudit?.elapsedTicks === 1
      && (!i || snapshot.tickAudit.before === frames[i - 1].tickAudit.after), 'Final shore samples skipped native world ticks');
    const owner = snapshot.players[0], pet = owner.nearbyEntities.find(e => e.uuid === petUuid);
    assert(pet && pet.health === pet.maxHealth && pet.health > 0 && pet.tameable?.ownedByPlayer
      && pet.custom?.harness, 'Stable shore observation lost the original healthy owned pet');
    assert(pet.tameable.orderedToSit === (initialSit && !sawWet), 'Stable shore observation changed the expected order');
    if (mustFollow) {
      assert(pet.inWater === false && pet.onGround === true && !pet.vehicle && !pet.noGravity
        && Number.isFinite(pet.maxAir) && pet.maxAir > 0 && pet.air === pet.maxAir, 'Following shore recovery was not stable and breathing');
      assert(Math.hypot(...['x', 'y', 'z'].map(k => pet.position?.[k] - owner.position?.[k])) < 4,
        'Following pet left its owner during the final shore observation');
    }
  }
  return { consecutiveWorldSamples: frames.length, mustFollow };
}

module.exports = { WALK_TICKS, SETTLE_TICKS, shoreGeometry, assertShoreAudit, assertOwnerInShore, buildShoreBank, assertShoreEndpoint, assertStableShore };
