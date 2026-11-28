import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import { hold, retreatFromNearbyMob, stepOut } from './expedition-home.mjs';
import { OVERWORLD, withCompanion } from './expedition-nether.mjs';

const EYE = 'minecraft:ender_eye';
const FLYING_EYE = 'minecraft:eye_of_ender';
const feet = ({ position: { x, y, z } }) => [x, y, z].map(Math.floor);
const horizontalDistance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function eyeBearing(first, last) {
  const dx = last[0] - first[0];
  const dz = last[2] - first[2];
  const distance = Math.hypot(dx, dz);
  return distance >= 1 ? { x: dx / distance, z: dz / distance, distance } : null;
}

export function intersectEyeBearings(first, second) {
  const a = first.bearing;
  const b = second.bearing;
  const dx = second.origin.x - first.origin.x;
  const dz = second.origin.z - first.origin.z;
  const cross = a.x * b.z - a.z * b.x;
  if (Math.abs(cross) < 0.025) return null;
  const alongFirst = (dx * b.z - dz * b.x) / cross;
  const alongSecond = (dx * a.z - dz * a.x) / cross;
  if (alongFirst < 0 || alongSecond < 0) return null;
  return { x: first.origin.x + a.x * alongFirst, z: first.origin.z + a.z * alongFirst };
}

async function watchThrownEye(action) {
  const args = { type: FLYING_EYE, radius: 28, max: 16 };
  const present = new Set((await action('get_entities', args))?.entities.map(eye => eye.uuid));
  await hold(action, EYE);
  await action('look', { pitch: -14 });
  await action('use_item');
  let thrown;
  let first;
  let bearing;
  for (let sample = 0; sample < 66; sample++) {
    const seen = await action('get_entities', args);
    if (!seen) continue;
    const eye = seen.entities.find(eye => thrown ? eye.uuid === thrown : !present.has(eye.uuid));
    if (eye) {
      if (!thrown) {
        thrown = eye.uuid;
        first = eye.pos;
      }
      bearing = eyeBearing(first, eye.pos) ?? bearing;
      if (bearing?.distance >= 4) return { ...bearing, eye: thrown };
    } else if (thrown || sample >= 20) break;
    await setTimeout(70);
  }
  assert.ok(bearing, 'The thrown Eye of Ender did not provide a usable horizontal bearing');
  return { ...bearing, eye: thrown };
}

export async function scoutByEye(action, uuid, report = async () => {}) {
  const origin = await withCompanion(action, OVERWORLD, uuid);
  const bearing = await watchThrownEye(action);
  const advance = ({ x, z }) => (x - origin.position.x) * bearing.x + (z - origin.position.z) * bearing.z;
  const destination = [origin.position.x + 24 * bearing.x, origin.position.y,
    origin.position.z + 24 * bearing.z].map(Math.floor);
  await report(bearing);

  const visited = [];
  const rejected = new Set();
  for (let step = 0; step < 16; step++) {
    const player = await action('observe');
    assert.ok(player?.inWorld && player.health >= 8 && player.dimension === OVERWORLD,
      'Stronghold scouting became unsafe');
    if (advance(player.position) >= 8) {
      await withCompanion(action, OVERWORLD, uuid);
      return;
    }
    if (await retreatFromNearbyMob(action, player, visited, rejected)) continue;
    visited.push(feet(player));
    await stepOut(action, player, visited, destination, undefined, rejected);
  }
  throw new Error('No reachable dry route advanced toward the thrown Eye of Ender');
}

async function travelToward(action, target, arrived, maxSteps, travel) {
  let closest = Infinity;
  let stalled = 0;
  let detour;
  let side = 1;
  for (let step = 0; step <= maxSteps; step++) {
    const player = await action('observe');
    assert.ok(player?.inWorld && !player.dead && player.health >= 8 && player.dimension === OVERWORLD,
      'Stronghold scouting became unsafe');
    if (player.onGround && arrived(player.position)) return player.position;
    if (step === maxSteps) break;
    if (!player.onGround) {
      await setTimeout(150);
      continue;
    }
    if (await retreatFromNearbyMob(action, player, travel.visited, travel.rejected)) continue;
    const remaining = horizontalDistance(player.position, target);
    if (remaining < closest - 1) {
      closest = remaining;
      stalled = 0;
    }
    if (detour && (horizontalDistance(player.position, detour) <= 4 || step >= detour.until)) {
      detour = undefined;
      stalled = 0;
    } else if (!detour && ++stalled >= 4) {
      // Follow the obstacle sideways long enough to get past the local ledge.
      const { x, z } = player.position;
      const dx = (target.x - x) / remaining;
      const dz = (target.z - z) / remaining;
      detour = { x: x - side * dz * 24, z: z + side * dx * 24, until: step + 14 };
      side = -side;
      stalled = 0;
    }
    travel.visited.push(feet(player));
    const destination = detour ?? target;
    await stepOut(action, player, travel.visited,
      [Math.floor(destination.x), Math.floor(player.position.y), Math.floor(destination.z)], 'surface', travel.rejected);
  }
  return null;
}

export async function navigateToStronghold(action, uuid, report = async () => {}) {
  const player = await withCompanion(action, OVERWORLD, uuid);
  const travel = { visited: [], rejected: new Set() };
  let first = { origin: player.position, bearing: await watchThrownEye(action) };
  for (let sight = 0; sight < 3; sight++) {
    await report('bearing', first);
    const sideways = { x: -first.bearing.z, z: first.bearing.x };
    const baseline = Math.min(28, 16 + sight * 6);
    let origin;
    for (const side of [1, -1]) {
      const target = { x: first.origin.x + side * sideways.x * baseline,
        z: first.origin.z + side * sideways.z * baseline };
      origin = await travelToward(action, target, pos =>
        side * ((pos.x - first.origin.x) * sideways.x + (pos.z - first.origin.z) * sideways.z) >= baseline - 3,
      18, travel);
      if (origin) break;
    }
    assert.ok(origin, 'Could not form a dry baseline for a second Eye of Ender bearing');
    await withCompanion(action, OVERWORLD, uuid);
    const second = { origin, bearing: await watchThrownEye(action) };
    await report('bearing', second);
    const estimate = intersectEyeBearings(first, second);
    if (estimate && horizontalDistance(origin, estimate) < 144) {
      await report('fix', estimate);
      const reached = await travelToward(action, estimate, pos => horizontalDistance(pos, estimate) <= 6, 80, travel);
      if (reached) {
        await withCompanion(action, OVERWORLD, uuid);
        return estimate;
      }
    }
    const ahead = { x: origin.x + second.bearing.x * 64, z: origin.z + second.bearing.z * 64 };
    const reached = await travelToward(action, ahead, pos => horizontalDistance(pos, ahead) <= 12, 24, travel);
    assert.ok(reached, 'Could not get closer to refine the stronghold bearing');
    first = { origin: reached, bearing: await watchThrownEye(action) };
  }
  throw new Error('The Eye of Ender bearings did not yield a reachable stronghold approach');
}
