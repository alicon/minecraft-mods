import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import {
  breakVisible, descendQuarry, dogMealCount, feedAdoptedDog, hold, regroupExpeditionCompanion, retreatFromNearbyMob, stepOut,
} from './expedition-home.mjs';
import { dryStepKey, dryWaypoint, hasDrySupport, STRONGHOLD_MASONRY } from './expedition-navigation.mjs';
import { OVERWORLD, withCompanion } from './expedition-nether.mjs';

const FRAME = 'minecraft:end_portal_frame';
const PORTAL = 'minecraft:end_portal';
const END = 'minecraft:the_end';
const EYE = 'minecraft:ender_eye';
const POWDER = 'minecraft:blaze_powder';
const PEARL = 'minecraft:ender_pearl';
const ROD = 'minecraft:blaze_rod';
const SIDES = [[-1, 0], [0, -1], [1, 0], [0, 1]];
const RING = SIDES.flatMap(([dx, dz]) => [-1, 0, 1].map(offset => [2 * dx + offset * dz, 2 * dz + offset * dx]));
const INTERIOR = [-1, 0, 1].flatMap(x => [-1, 0, 1].map(z => [x, z]));
const AIR = /^minecraft:(?:air|cave_air|void_air)$/;
const DOG = 'mushroom_yorkie:mushroom_yorkie';
const STRONGHOLD_BARRIER = /^minecraft:(?:\w+_door|iron_bars)$/;
const feet = ({ position: { x, y, z } }) => [x, y, z].map(Math.floor);
const count = (stock, item) => stock.slots.reduce((total, stack) => total + (stack.id === item ? stack.count : 0), 0);
const distance = (pos, player) => Math.hypot(pos[0] + 0.5 - player.x, pos[1] - player.y, pos[2] + 0.5 - player.z);
const free = id => id === undefined || AIR.test(id);

export function enderEyeCount(inventory) {
  return count(inventory, EYE);
}

export function findEndRing(cells, player) {
  const blocks = new Map(cells.map(({ x, y, z, b }) => [String([x, y, z]), b]));
  const at = (x, y, z) => blocks.get(String([x, y, z]));
  const seen = new Set();
  const found = [];
  for (const cell of cells.filter(({ b }) => b === FRAME)) {
    const { x, y, z } = cell;
    for (const [dx, dz] of RING) {
      const [cx, cz] = [x - dx, z - dz];
      const center = [cx, y, cz];
      const key = String(center);
      if (seen.has(key)) continue;
      seen.add(key);
      const frame = RING.map(([ox, oz]) => [cx + ox, y, cz + oz]);
      if (!frame.every(pos => at(...pos) === FRAME)) continue;
      const interior = INTERIOR.map(([ox, oz]) => at(cx + ox, y, cz + oz));
      const lit = interior.every(id => id === PORTAL);
      if (!lit && !interior.every(free)) continue;
      const approaches = SIDES.flatMap(([ox, oz]) => [0, -1, 1].flatMap(offset => {
        const x = cx + 3 * ox + offset * oz;
        const z = cz + 3 * oz + offset * ox;
        if (!free(at(x - ox, y + 1, z - oz)) || !free(at(x - ox, y + 2, z - oz))) return [];
        return [y, y + 1, y - 1, y - 2].filter(height =>
          hasDrySupport(at(x, height - 1, z)) && free(at(x, height, z)) && free(at(x, height + 1, z))
          && free(at(x, height + 2, z))).map(height => [x, height, z]);
      })).sort((a, b) => distance(a, player) - distance(b, player));
      if (approaches.length) found.push({ center, frame, approaches, lit });
    }
  }
  return found.sort((a, b) => distance(a.approaches[0], player) - distance(b.approaches[0], player))[0];
}

export async function craftEyes(action, craft, total = 12) {
  let inventory = await action('get_inventory');
  const wanted = Math.min(total - enderEyeCount(inventory), count(inventory, PEARL));
  if (wanted > count(inventory, POWDER) && count(inventory, ROD)) {
    await craft(POWDER, Math.min(wanted - count(inventory, POWDER), 2 * count(inventory, ROD)));
    inventory = await action('get_inventory');
  }
  const eyes = Math.min(wanted, count(inventory, POWDER));
  if (eyes > 0) await craft(EYE, eyes);
}

async function approach(action, pos) {
  const visited = [];
  const rejected = new Set();
  for (let attempt = 0; attempt < 12; attempt++) {
    const player = await action('observe');
    if (distance(pos, player.position) <= 0.65) return true;
    visited.push(feet(player));
    if (!await stepOut(action, player, visited, pos, 'stronghold', rejected)) break;
  }
  return false;
}

async function litPortal(action, center) {
  const blocks = await action('get_blocks', { center, size: [3, 1, 3], format: 'json' });
  return blocks?.cells.filter(({ b }) => b === PORTAL).length === 9;
}

async function fillEndRing(action, ring) {
  const inspected = new Set();
  let eyes = count(await action('get_inventory'), EYE);
  for (const stance of ring.approaches) {
    if (!await approach(action, stance)) continue;
    for (const pos of ring.frame) {
      if (eyes === 0) return;
      if (inspected.has(pos)) continue;
      if (!await action('look', { at: pos })) continue;
      const view = await action('observe');
      if (view?.crosshair?.block !== FRAME || String(view.crosshair.pos) !== String(pos)) continue;
      await hold(action, EYE);
      const result = await action('interact_block', { pos, face: view.crosshair.face });
      if (!result) continue;
      await setTimeout(130);
      const remaining = count(await action('get_inventory'), EYE);
      assert.ok(remaining === eyes || remaining === eyes - 1, 'Unexpected eye consumption at the portal');
      if (remaining < eyes) {
        if (await litPortal(action, ring.center)) return;
        inspected.add(pos);
      } else if (result.result === 'Pass') {
        inspected.add(pos);
      }
      eyes = remaining;
    }
  }
}

export function strongholdEntrance(cells, here) {
  const volume = new Map(cells.map(({ x, y, z, b }) => [String([x, y, z]), b]));
  const block = pos => volume.get(String(pos));
  const masonry = pos => STRONGHOLD_MASONRY.test(block(pos) ?? '');
  const standing = ([x, y, z]) => masonry([x, y - 1, z])
    && free(block([x, y, z])) && free(block([x, y + 1, z]))
    && [y + 2, y + 3].some(above => masonry([x, above, z]));
  if (standing(here)) return { landing: here, entry: here };

  const stances = cells.filter(({ b }) => STRONGHOLD_MASONRY.test(b))
    .map(({ x, y, z }) => [x, y + 1, z])
    .filter(pos => standing(pos) && Math.abs(pos[1] - here[1]) <= 3)
    .sort((a, b) => Math.hypot(a[0] - here[0], a[1] - here[1], a[2] - here[2])
      - Math.hypot(b[0] - here[0], b[1] - here[1], b[2] - here[2]));
  for (const entry of stances) {
    const landing = dryWaypoint(cells, here, [], entry, 'stronghold');
    if (landing && String(landing) === String(entry)) return { entry, landing };
  }

  const [x, y, z] = here;
  for (const [dx, dz] of SIDES) {
    const entry = [x + 2 * dx, y, z + 2 * dz];
    if (!standing(entry)) continue;
    const landing = [x + dx, y, z + dz];
    if (!hasDrySupport(block([landing[0], y - 1, landing[2]]))
        || SIDES.some(([sx, sz]) => [y, y + 1].some(height =>
          /^minecraft:(?:lava|water)$/.test(block([landing[0] + sx, height, landing[2] + sz]) ?? '')))) continue;
    const wall = [[landing[0], y + 1, landing[2]], landing];
    if (wall.every(pos => free(block(pos)) || STRONGHOLD_MASONRY.test(block(pos) ?? ''))) {
      const clear = wall.filter(pos => !free(block(pos)));
      if (clear.length) return { landing, entry, clear };
    }
  }
  return null;
}

export async function descendToStronghold(action, uuid, toward, report = async () => {}) {
  const stairs = [];
  const protectedGround = new Set();
  const route = { toward, rejected: new Set(), masonry: true };
  const visited = [];
  const rejectedSteps = new Set();
  let lastDog;
  let sinceCare = 4;
  let blocked = 0;
  for (let attempt = 0; attempt < 144 && stairs.length < 72; attempt++) {
    const player = await action('observe');
    assert.ok(player?.inWorld && player.dimension === OVERWORLD && player.health >= 10 && !player.dead,
      'The stronghold descent became unsafe');
    if (!player.onGround) {
      await setTimeout(150);
      continue;
    }
    if (await retreatFromNearbyMob(action, player, visited, rejectedSteps)) continue;
    const here = feet(player);
    if (++sinceCare >= 4) {
      const nearby = await action('get_entities', { type: DOG, radius: 24 });
      const dog = nearby?.entities.find(entity => entity.uuid === uuid && entity.health > 0);
      if (!dog || dog.distance > 9) {
        lastDog = (await regroupExpeditionCompanion(action, uuid, dog?.pos ?? lastDog)).pos;
        sinceCare = 0;
        continue;
      }
      lastDog = dog.pos;
      if (dog.health <= 8) {
        assert.ok(await feedAdoptedDog(action, uuid, here, 18), 'Mushroom needs a meal before the next stair');
        sinceCare = 0;
        continue;
      }
      sinceCare = 0;
    }
    const view = await action('get_blocks', { center: here, size: [9, 9, 9], format: 'json' });
    const access = view && strongholdEntrance(view.cells, here);
    if (access) {
      if (String(access.entry) === String(here)) {
        await withCompanion(action, OVERWORLD, uuid);
        await report('descent', { position: here, stairs: stairs.length });
        return;
      }
      let clear = true;
      for (const pos of access.clear ?? []) {
        if (!(await breakVisible(action, pos))?.broken) {
          clear = false;
          break;
        }
      }
      if (clear && await stepOut(action, player, [], access.landing, 'stronghold', rejectedSteps,
        undefined, undefined, 28)) continue;
    }
    const result = await descendQuarry(action, player, undefined, stairs, protectedGround, route);
    if (Array.isArray(result)) {
      blocked = 0;
      await report('descent_step', { position: result });
      continue;
    }
    if (result === 'blocked' && ++blocked < 4) continue;
    visited.push(here);
    const alternative = await stepOut(action, player, visited.slice(-12), toward, 'cave', rejectedSteps,
      undefined, undefined, 28);
    if (!alternative || ++blocked >= 7) break;
  }
  throw new Error('Could not find a dry descent into masonry below the Eye bearings');
}

export function strongholdPassage(cells, here, targets, rejectedSteps, rejectedWalls) {
  const blocks = new Map(cells.map(({ x, y, z, b }) => [String([x, y, z]), b]));
  const block = (x, y, z) => blocks.get(String([x, y, z]));
  const clearable = id => STRONGHOLD_MASONRY.test(id ?? '') || STRONGHOLD_BARRIER.test(id ?? '');
  const supported = (x, y, z) => hasDrySupport(block(x, y - 1, z));
  const dry = (x, y, z) => supported(x, y, z) && free(block(x, y, z)) && free(block(x, y + 1, z));
  const closeTo = point => point[0] === here[0] && point[1] === here[1] && point[2] === here[2];
  const route = (start, ends) => dryWaypoint(cells, start, [], undefined, 'stronghold', rejectedSteps, undefined, ends);
  const candidates = [];
  for (const { x, y, z, b } of cells) {
    const wall = [x, y, z];
    if (rejectedWalls.has(String(wall)) || Math.abs(y - here[1]) > 3
        || Math.hypot(x - here[0], z - here[2]) > 14 || !supported(x, y, z)) continue;
    const upper = block(x, y + 1, z);
    if (!clearable(b) || (!free(upper) && !clearable(upper))) continue;
    if (SIDES.some(([dx, dz]) => [y, y + 1].some(height =>
      /^minecraft:(?:water|lava)$/.test(block(x + dx, height, z + dz) ?? '')))) continue;
    for (const [dx, dz] of SIDES) {
      const near = [x - dx, y, z - dz];
      const far = [x + dx, y, z + dz];
      if (!dry(...near) || !dry(...far)) continue;
      candidates.push({ near, far, wall, clear: free(upper) ? [wall] : [[x, y + 1, z], wall] });
    }
  }
  candidates.sort((a, b) => Math.hypot(...a.near.map((n, index) => n - here[index]))
    - Math.hypot(...b.near.map((n, index) => n - here[index])));
  for (const candidate of candidates) {
    const near = closeTo(candidate.near);
    const segment = near ? null : route(here, [candidate.near]);
    if (!near && !segment) continue;
    if (targets.some(target => String(target) === String(candidate.far)) || route(candidate.far, targets)) {
      return { ...candidate, segment };
    }
  }
  return null;
}

export async function findStrongholdPortalRoom(action, uuid, report = async () => {}) {
  const visited = [];
  const rejected = new Set();
  const rejectedWalls = new Set();
  let lastDog;
  let nextCare = 0;
  for (let step = 0; step < 150; step++) {
    const player = await action('observe');
    assert.ok(player?.inWorld && !player.dead && player.dimension === OVERWORLD && player.health >= 8,
      'The stronghold route became unsafe');
    if (!player.onGround) {
      await setTimeout(150);
      continue;
    }
    if (player.gameTime >= nextCare) {
      nextCare = player.gameTime + 240;
      const dogs = await action('get_entities', { type: DOG, radius: 24 });
      const dog = dogs?.entities.find(entity => entity.uuid === uuid && entity.health > 0);
      if (!dog || dog.distance > 16) {
        lastDog = (await regroupExpeditionCompanion(action, uuid, dog?.pos ?? lastDog)).pos;
        continue;
      }
      lastDog = dog.pos;
      if (dog.health <= 8) {
        assert.ok(dogMealCount(await action('get_inventory')) > 0 && await feedAdoptedDog(action, uuid, feet(player), 22),
          'Mushroom needs food before continuing through the stronghold');
        continue;
      }
    }
    const here = feet(player);
    const room = await action('get_blocks', { center: here, size: [39, 13, 39], format: 'json' });
    if (!room) continue;
    const ring = findEndRing(room.cells, player.position);
    if (ring?.approaches.some(stance => distance(stance, player.position) < 2.5)) {
      const spawner = room.cells.find(cell => cell.b === 'minecraft:spawner'
        && distance([cell.x, cell.y, cell.z], player.position) < 4);
      if (spawner && (await breakVisible(action, [spawner.x, spawner.y, spawner.z]))?.broken) {
        await report('disabled_spawner', { position: [spawner.x, spawner.y, spawner.z] });
      }
      await withCompanion(action, OVERWORLD, uuid);
      await report('portal_room', { center: ring.center, from: here });
      return ring;
    }
    const segment = ring && dryWaypoint(room.cells, here, [], undefined, 'stronghold', rejected, undefined, ring.approaches);
    if (segment) {
      const walk = await action('go_to', { pos: segment, stopDistance: 0.3, maxTicks: 45 });
      if (walk?.arrived) continue;
      rejected.add(dryStepKey(here, segment));
    }
    const passage = ring && strongholdPassage(room.cells, here, ring.approaches, rejected, rejectedWalls);
    if (passage?.segment) {
      const walk = await action('go_to', { pos: passage.segment, stopDistance: 0.3, maxTicks: 45 });
      if (walk?.arrived) continue;
      rejected.add(dryStepKey(here, passage.segment));
    } else if (passage) {
      rejectedWalls.add(String(passage.wall));
      let opened = true;
      for (const pos of passage.clear) {
        // A door disappears as a pair when one half is mined.
        const live = await action('get_blocks', { center: pos, size: [1, 1, 1], format: 'json' });
        if (!live || (!free(live.cells[0]?.b) && !(await breakVisible(action, pos))?.broken)) {
          opened = false;
          break;
        }
      }
      if (opened) await report('opened_passage', { wall: passage.wall, toward: passage.far });
      continue;
    }
    visited.push(here);
    const frame = ring ? undefined : room.cells.find(cell => cell.b === FRAME);
    const target = ring?.approaches[0] ?? (frame && [frame.x, frame.y, frame.z]);
    const moved = await stepOut(action, player, visited, target, 'stronghold', rejected, undefined, undefined, 45);
    if (moved && step % 4 !== 3) continue;
    const position = (await action('observe')).position;
    for (const { x, y, z, b } of room.cells.filter(cell => STRONGHOLD_BARRIER.test(cell.b))) {
      const pos = [x, y, z];
      if (distance(pos, position) > 3.6) continue;
      if (!(await breakVisible(action, pos))?.broken) continue;
      await report('cleared_doorway', { position: pos, block: b });
      break;
    }
  }
  throw new Error('Could not reach a dry stance beside the generated stronghold portal');
}

export async function crossEndPortal(action, craft, uuid, observedRing) {
  const player = await withCompanion(action, OVERWORLD, uuid);
  const area = observedRing ? null : await action('get_blocks', { center: feet(player), size: [19, 11, 19], format: 'json' });
  const ring = observedRing ?? (area && findEndRing(area.cells, player.position));
  assert.ok(ring, 'No observed End portal frame with a dry approach');
  if (!ring.lit) {
    await craftEyes(action, craft);
    await fillEndRing(action, ring);
  }
  assert.ok(await litPortal(action, ring.center), 'Native Use did not open the complete End portal');
  for (const stance of ring.approaches.filter(stance => stance[1] >= ring.center[1])) {
    if (!await approach(action, stance)) continue;
    const { position } = await action('observe');
    const dx = ring.center[0] + 0.5 - position.x;
    const dz = ring.center[2] + 0.5 - position.z;
    const yaw = Math.atan2(-dx, dz) * 180 / Math.PI;
    await action('move', { yaw, forward: true, jump: true, ticks: 13 });
    // Movement is released before waiting for the dimension to load.
    for (let tick = 0; tick < 10; tick++) {
      const current = await action('observe');
      if (!current?.inWorld || current.dimension === END) return withCompanion(action, END, uuid);
      await setTimeout(150);
    }
  }
  throw new Error('The player could not jump from dry ground into the active End portal');
}
