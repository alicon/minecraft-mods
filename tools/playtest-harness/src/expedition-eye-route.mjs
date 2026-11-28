import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import { dogMealCount, feedAdoptedDog, hold, regroupExpeditionCompanion, retreatFromNearbyMob, stepOut } from './expedition-home.mjs';
import { OVERWORLD, withCompanion } from './expedition-nether.mjs';

const EYE = 'minecraft:ender_eye';
const FLYING_EYE = 'minecraft:eye_of_ender';
const DOG = 'mushroom_yorkie:mushroom_yorkie';
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
    if (player.gameTime >= travel.nextCareCheck) {
      travel.nextCareCheck = player.gameTime + (travel.returning ? 45 : 200);
      const dogs = await action('get_entities', { type: DOG, radius: 24 });
      const dog = dogs?.entities.find(entity => entity.uuid === travel.uuid && entity.health > 0);
      if (dog) travel.lastDog = dog.pos;
      if (travel.returning && (!dog || dog.distance > 10)) {
        const together = await regroupExpeditionCompanion(action, travel.uuid, travel.lastDog);
        travel.lastDog = together.pos;
        continue;
      }
      if (!dog) {
        await withCompanion(action, OVERWORLD, travel.uuid);
        continue;
      }
      if (dog.health <= 8) {
        assert.ok(dogMealCount(await action('get_inventory')) > 0, 'Mushroom needs food before continuing the stronghold route');
        assert.ok(await feedAdoptedDog(action, travel.uuid, feet(player), 24), 'Could not feed Mushroom on the stronghold route');
        continue;
      }
    }
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
    const approachKnownHeight = !detour && travel.returning && Number.isFinite(target.y) && remaining <= 12;
    await stepOut(action, player, travel.visited, [
      Math.floor(destination.x), Math.floor(approachKnownHeight ? target.y : player.position.y), Math.floor(destination.z),
    ], approachKnownHeight ? 'elevation' : 'surface', travel.rejected);
  }
  return null;
}

function* completeActionRows(trace) {
  // The final line can still be in flight while the launcher appends to the trace.
  for (const line of trace.split('\n').slice(0, -1)) {
    if (!line.startsWith('{')) continue;
    try {
      yield JSON.parse(line);
    } catch {
      // A controller interrupted during logging can leave a partial row.
    }
  }
}

export function firstIronOutboundTrail(trace, bed) {
  const trail = [];
  for (const { action, observation } of completeActionRows(trace)) {
    if (action === 'get_inventory' && observation?.slots?.some(stack => stack.id === 'minecraft:raw_iron')) break;
    if (action !== 'observe' || !observation?.onGround || observation.inWater || observation.dead
        || observation.dimension !== OVERWORLD) continue;
    const point = feet(observation);
    if (Math.hypot(...point.map((value, index) => value - bed[index])) <= 4) {
      trail.splice(0, trail.length, point);
      continue;
    }
    if (!trail.length) continue;
    const previous = trail.findIndex(pos => String(pos) === String(point));
    if (previous >= 0) trail.splice(previous + 1);
    else if (Math.hypot(...point.map((value, index) => value - trail.at(-1)[index])) >= 5) trail.push(point);
  }
  return trail;
}

export function companionRegroupTrail(trace, uuid) {
  const trail = [];
  let grounded;
  for (const { action, observation } of completeActionRows(trace)) {
    if (action === 'get_entities') {
      const dog = observation?.entities?.find(entity => entity.uuid === uuid && entity.health > 0);
      if (grounded && dog?.distance <= 4 && Math.abs(dog.pos[1] - grounded[1]) <= 2) {
        trail.splice(0, trail.length, grounded);
      }
      continue;
    }
    if (action !== 'observe') continue;
    grounded = observation?.onGround && !observation.inWater && !observation.dead
      && observation.dimension === OVERWORLD ? feet(observation) : undefined;
    if (!grounded || !trail.length) continue;
    const repeat = trail.findIndex(pos => pos[1] === grounded[1]
      && Math.hypot(pos[0] - grounded[0], pos[2] - grounded[2]) <= 1);
    if (repeat >= 0) trail.splice(repeat + 1);
    else if (Math.hypot(...grounded.map((value, axis) => value - trail.at(-1)[axis])) >= 2) trail.push(grounded);
  }
  return trail;
}

export async function returnToCampWithCompanion(action, uuid, bed, trail = []) {
  const start = await withCompanion(action, OVERWORLD, uuid);
  const camp = { x: bed[0] + 0.5, y: bed[1], z: bed[2] + 0.5 };
  const atCamp = pos => horizontalDistance(pos, camp) <= 4 && Math.abs(pos.y - bed[1]) <= 2;
  const travel = { visited: [], rejected: new Set(), uuid, nextCareCheck: 0, returning: true };
  const nearby = trail.map(([x, y, z], index) => ({ index,
    range: Math.hypot(start.position.x - x - 0.5, start.position.y - y, start.position.z - z - 0.5) }))
    .filter(point => point.range <= 14).sort((a, b) => a.range - b.range)[0];
  if (nearby && !atCamp(start.position)) {
    for (const [x, y, z] of trail.slice(0, nearby.index + 1).reverse()) {
      const point = { x: x + 0.5, y, z: z + 0.5 };
      await travelToward(action, point, pos => horizontalDistance(pos, point) <= 2.5 && Math.abs(pos.y - y) <= 1,
        18, travel);
    }
  }
  const steps = Math.min(180, Math.ceil(horizontalDistance(start.position, camp)) + 35);
  const reached = await travelToward(action, camp, atCamp, steps, travel);
  assert.ok(reached, 'The player could not find a dry route back to the expedition bed');
  for (let check = 0; check < 16; check++) {
    const owner = await action('observe');
    assert.ok(owner?.inWorld && owner.dimension === OVERWORLD && !owner.dead && atCamp(owner.position),
      'The player moved away from the camp during reunification');
    const dogs = await action('get_entities', { type: DOG, radius: 24 });
    const dog = dogs?.entities.find(entity => entity.uuid === uuid && entity.health > 0 && entity.distance <= 6);
    if (dog && Math.hypot(dog.pos[0] - camp.x, dog.pos[1] - bed[1], dog.pos[2] - camp.z) <= 8) return { owner, dog };
    await setTimeout(250);
  }
  throw new Error('The original Mushroom did not arrive beside the expedition bed');
}

export async function navigateToStronghold(action, uuid, report = async () => {}) {
  const player = await withCompanion(action, OVERWORLD, uuid);
  const travel = { visited: [], rejected: new Set(), uuid, nextCareCheck: 0 };
  let first = { origin: player.position, bearing: await watchThrownEye(action) };
  for (let sight = 0; sight < 4; sight++) {
    await report('bearing', first);
    const sideways = { x: -first.bearing.z, z: first.bearing.x };
    const baseline = [16, 32, 56, 96][sight];
    let origin;
    for (const side of [1, -1]) {
      const target = { x: first.origin.x + side * sideways.x * baseline,
        z: first.origin.z + side * sideways.z * baseline };
      origin = await travelToward(action, target, pos =>
        side * ((pos.x - first.origin.x) * sideways.x + (pos.z - first.origin.z) * sideways.z) >= baseline - 3,
      16 + baseline, travel);
      if (origin) break;
    }
    assert.ok(origin, 'Could not form a dry baseline for a second Eye of Ender bearing');
    await withCompanion(action, OVERWORLD, uuid);
    const second = { origin, bearing: await watchThrownEye(action) };
    await report('bearing', second);
    const estimate = intersectEyeBearings(first, second);
    const distance = estimate ? horizontalDistance(origin, estimate) : Infinity;
    if (distance < 3_000) {
      await report('fix', estimate);
      const coarse = distance >= 180;
      const reached = await travelToward(action, estimate, pos => horizontalDistance(pos, estimate) <= (coarse ? 40 : 6),
        Math.min(700, 80 + Math.ceil(distance * 0.7)), travel);
      if (reached) {
        await withCompanion(action, OVERWORLD, uuid);
        if (!coarse) return estimate;
        first = { origin: reached, bearing: await watchThrownEye(action) };
        continue;
      }
    }
    const advance = 64 + sight * 48;
    const ahead = { x: origin.x + second.bearing.x * advance, z: origin.z + second.bearing.z * advance };
    const reached = await travelToward(action, ahead, pos => horizontalDistance(pos, ahead) <= 12, 30 + sight * 28, travel);
    assert.ok(reached, 'Could not get closer to refine the stronghold bearing');
    first = { origin: reached, bearing: await watchThrownEye(action) };
  }
  throw new Error('The Eye of Ender bearings did not yield a reachable stronghold approach');
}
