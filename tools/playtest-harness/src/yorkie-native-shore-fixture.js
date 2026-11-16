'use strict';

const assert = require('node:assert/strict');
const WALK_TICKS = 80;
const SETTLE_TICKS = 120;
const volume = r => (r.x2 - r.x1 + 1) * (r.y2 - r.y1 + 1) * (r.z2 - r.z1 + 1);
const AUDIT_BLOCKS = { floor: 'minecraft:grass_block', headroom: 'minecraft:air', bottom: 'minecraft:stone',
  ramp: 'minecraft:stone_slab', water: 'minecraft:water', leftWall: 'minecraft:stone', rightWall: 'minecraft:stone',
  backWall: 'minecraft:stone', poolHeadroom: 'minecraft:air' };

function shoreGeometry(base) {
  assert(['x', 'y', 'z'].every(k => Number.isInteger(base[k])) && base.y >= -62 && base.y <= 316, 'Invalid shore fixture origin');
  // This generous run-out covers 0.5 blocks per walking tick plus four blocks.
  // Runtime bounds also cancel input before an owner can reach a platform edge.
  const endZ = base.z + Math.ceil(WALK_TICKS * 0.5) + 4;
  const floor = { x1: base.x - 7, y1: base.y - 1, z1: base.z + 4, x2: base.x + 7, y2: base.y - 1, z2: endZ };
  const headroom = { ...floor, y1: base.y, y2: base.y + 2 };
  const bottom = { x1: base.x - 2, y1: base.y - 2, z1: base.z - 3, x2: base.x + 2, y2: base.y - 2, z2: base.z + 2 };
  const ramp = { x1: base.x - 2, y1: base.y - 1, z1: base.z + 3, x2: base.x + 2, y2: base.y - 1, z2: base.z + 3 };
  const water = { ...bottom, y1: base.y - 1, y2: base.y - 1 };
  const leftWall = { x1: base.x - 3, y1: base.y - 1, z1: base.z - 4, x2: base.x - 3, y2: base.y - 1, z2: base.z + 3 };
  const rightWall = { ...leftWall, x1: base.x + 3, x2: base.x + 3 };
  const backWall = { ...water, z1: base.z - 4, z2: base.z - 4 };
  const poolHeadroom = { x1: base.x - 3, y1: base.y, z1: base.z - 4, x2: base.x + 3, y2: base.y + 2, z2: base.z + 3 };
  const clear = [];
  const span = Math.min(20, Math.floor(32768 / (15 * (320 - base.y))));
  for (let z = base.z + 8; z <= endZ; z += span) {
    clear.push({ x1: base.x - 7, y1: base.y, z1: z, x2: base.x + 7, y2: 319, z2: Math.min(endZ, z + span - 1) });
  }
  return { base, endZ, floor, headroom, bottom, ramp, water, leftWall, rightWall, backWall, poolHeadroom, clear };
}

function assertShoreAudit(geometry, audit) {
  for (const [name, block] of Object.entries(AUDIT_BLOCKS)) {
    const observed = audit[name], expected = volume(geometry[name]);
    assert(observed?.volume === expected && observed.counts?.[block] === expected, `Unsafe shore ${name}: required ${expected} ${block} blocks`);
  }
  assert(/(?:\[|,)type=bottom(?:,|\])/.test(audit.rampState?.state || ''), 'Shore bank requires a bottom slab');
}

function assertOwnerInShore(snapshot, geometry) {
  const p = snapshot.players[0].position, b = geometry.base;
  assert(p && p.x >= b.x - 6 && p.x <= b.x + 6 && p.z >= b.z - 6 && p.z <= geometry.endZ - 1
    && p.y >= b.y - (snapshot.players[0].vehicle ? 2 : 1.1) && p.y <= b.y + 1, 'Owner approached the shore fixture boundary; cancel native input');
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
  for (const name of Object.keys(AUDIT_BLOCKS)) audit[name] = await request('/count-blocks', geometry[name]);
  audit.rampState = await request('/block', { x: base.x, y: base.y - 1, z: base.z + 3 });
  assertShoreAudit(geometry, audit);
  return { geometry, audit };
}

function distance(a, b) { return Math.hypot(...['x', 'y', 'z'].map(k => a?.[k] - b?.[k])); }

function assertShoreBoardingGrace(snapshot, pet, { boatUuid, helpGameTime }) {
  if (!pet.vehicle) return;
  const boat = snapshot.players[0].nearbyEntities.find(e => e.uuid === boatUuid);
  assert(boat && pet.vehicle.id === boat.id, 'Helped pet boarded a different vehicle');
  for (const value of [helpGameTime, snapshot.overworldGameTime]) {
    assert(typeof value === 'string' && /^-?\d+$/.test(value), 'Native reboarding clock is unavailable');
  }
  // This is the mod's 200-entity-tick owner-help cooldown. The original nearby
  // fixture stays loaded; frozen steps and live movement use the same world clock.
  assert(BigInt(snapshot.overworldGameTime) - BigInt(helpGameTime) >= 200n, 'Helped pet reboarded before its 200-tick grace ended');
}

// The audited blocks are never changed during observation. Rounded entity positions
// need a 0.04-block tolerance around their known native support heights.
function dryRestSupport(pet, snapshot, { geometry, boatUuid, restAnchor }) {
  assert(pet.inWater === false && !pet.noGravity && Number.isFinite(pet.maxAir) && pet.maxAir > 0 && pet.air === pet.maxAir,
    'Dry sitting pet is wet, airborne-controlled or short of air');
  assert(distance(pet.position, restAnchor) <= 1, 'Dry sitting pet drifted more than one block after owner help');
  const boat = snapshot.players[0].nearbyEntities.find(e => e.uuid === boatUuid);
  assert(boat?.type === 'minecraft:oak_boat', 'Original sitting support boat is missing');
  if (pet.vehicle) {
    assert(pet.vehicle.id === boat.id && boat.passengers?.some(e => e.id === pet.id), 'Sitting pet boarded another vehicle');
    return 'original-boat-passenger'; // Ordinary reboarding after the grace period is allowed.
  }
  assert(pet.onGround === true, 'Dry sitting pet has no native grounded support');
  const p = pet.position, b = geometry.base;
  const over = r => p.x >= r.x1 && p.x < r.x2 + 1 && p.z >= r.z1 && p.z < r.z2 + 1;
  if (over(geometry.floor) && Math.abs(p.y - b.y) <= 0.04) return 'audited-bank';
  if (over(geometry.ramp) && Math.abs(p.y - b.y + 0.5) <= 0.04) return 'audited-step';
  // Native oak boat: height 0.5625, width 1.375; Yorkie width 0.42.
  // Require an actual overlap, with a rounding margin, and native onGround above.
  assert(Math.abs(p.y - boat.position.y - 0.5625) <= 0.04
    && Math.abs(p.x - boat.position.x) < 0.8775 && Math.abs(p.z - boat.position.z) < 0.8775,
  'Dry sitting pet is not supported by the original hull or audited blocks');
  return 'original-boat-hull';
}

function assertShoreEndpoint({ pet, owner, footBlock, ownerFootBlock, initialSit, sawWet, snapshot, ...rest }) {
  assert(pet && pet.health === pet.maxHealth && pet.health > 0 && pet.custom?.harness, 'Shore endpoint lost pet health or harness');
  assert(Number.isFinite(pet.maxAir) && pet.maxAir > 0 && pet.air === pet.maxAir, 'Shore endpoint has no full-air evidence');
  assert(pet.tameable?.orderedToSit === (initialSit && !sawWet), 'Shore endpoint changed the expected wet/dry order');
  assert(ownerFootBlock?.block === 'minecraft:grass_block', 'Owner did not finish on the checked dry bank');
  const mustFollow = !initialSit || sawWet;
  const drySupported = pet.inWater === false && pet.onGround === true && !pet.vehicle
    && ['minecraft:grass_block', 'minecraft:stone_slab'].includes(footBlock?.block);
  if (mustFollow) {
    assert(drySupported, 'Following pet did not reach dry block support');
    const distance = Math.hypot(...['x', 'y', 'z'].map(k => pet.position?.[k] - owner?.position?.[k]));
    assert(Number.isFinite(distance) && distance < 4, 'Following pet did not return near its original owner');
  }
  const sittingSupport = mustFollow ? null : dryRestSupport(pet, snapshot, rest);
  return { mustFollow, drySupported, sittingSupport };
}

function assertStableShore(frames, { petUuid, initialSit, sawWet, ...rest }) {
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
    } else dryRestSupport(pet, snapshot, rest);
  }
  return { consecutiveWorldSamples: frames.length, mustFollow };
}

module.exports = { WALK_TICKS, SETTLE_TICKS, AUDIT_BLOCKS, shoreGeometry, assertShoreAudit, assertOwnerInShore,
  buildShoreBank, assertShoreBoardingGrace, dryRestSupport, assertShoreEndpoint, assertStableShore };
