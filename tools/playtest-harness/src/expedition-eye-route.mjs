import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import { hold, retreatFromNearbyMob, stepOut } from './expedition-home.mjs';
import { OVERWORLD, withCompanion } from './expedition-nether.mjs';

const EYE = 'minecraft:ender_eye';
const FLYING_EYE = 'minecraft:eye_of_ender';
const feet = ({ position: { x, y, z } }) => [x, y, z].map(Math.floor);

export function eyeBearing(first, last) {
  const dx = last[0] - first[0];
  const dz = last[2] - first[2];
  const distance = Math.hypot(dx, dz);
  return distance >= 1 ? { x: dx / distance, z: dz / distance, distance } : null;
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
