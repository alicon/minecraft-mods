import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import { breakVisible, dogMealCount, feedAdoptedDog, hold, regroupExpeditionCompanion, stepOut } from './expedition-home.mjs';
import { hasDrySupport } from './expedition-navigation.mjs';
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

export async function findStrongholdPortalRoom(action, uuid, report = async () => {}) {
  const visited = [];
  const rejected = new Set();
  let lastDog;
  let nextCare = 0;
  for (let step = 0; step < 150; step++) {
    const player = await action('observe');
    assert.ok(player?.inWorld && !player.dead && player.dimension === OVERWORLD && player.health >= 8,
      'The stronghold route became unsafe');
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
