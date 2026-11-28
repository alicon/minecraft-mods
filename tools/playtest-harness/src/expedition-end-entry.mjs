import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import { hold, stepOut } from './expedition-home.mjs';
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
const feet = ({ position: { x, y, z } }) => [x, y, z].map(Math.floor);
const count = (stock, item) => stock.slots.reduce((total, stack) => total + (stack.id === item ? stack.count : 0), 0);
const distance = (pos, player) => Math.hypot(pos[0] + 0.5 - player.x, pos[1] - player.y, pos[2] + 0.5 - player.z);
const free = id => id === undefined || AIR.test(id);

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
      const approaches = SIDES.flatMap(([ox, oz]) => {
        const x = cx + 3 * ox;
        const z = cz + 3 * oz;
        return hasDrySupport(at(x, y - 1, z)) && free(at(x, y, z)) && free(at(x, y + 1, z))
          && free(at(x, y + 2, z)) && free(at(cx + 2 * ox, y + 1, cz + 2 * oz))
          && free(at(cx + 2 * ox, y + 2, cz + 2 * oz)) ? [[x, y, z]] : [];
      }).sort((a, b) => distance(a, player) - distance(b, player));
      if (approaches.length) found.push({ center, frame, approaches, lit });
    }
  }
  return found.sort((a, b) => distance(a.approaches[0], player) - distance(b.approaches[0], player))[0];
}

export async function craftEyes(action, craft, total = 12) {
  let inventory = await action('get_inventory');
  const wanted = Math.min(total - count(inventory, EYE), count(inventory, PEARL));
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
    if (!await stepOut(action, player, visited, pos, undefined, rejected)) break;
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

export async function crossEndPortal(action, craft, uuid) {
  const player = await withCompanion(action, OVERWORLD, uuid);
  const area = await action('get_blocks', { center: feet(player), size: [19, 11, 19], format: 'json' });
  const ring = area && findEndRing(area.cells, player.position);
  assert.ok(ring, 'No observed End portal frame with a dry approach');
  if (!ring.lit) {
    await craftEyes(action, craft);
    await fillEndRing(action, ring);
  }
  assert.ok(await litPortal(action, ring.center), 'Native Use did not open the complete End portal');
  for (const stance of ring.approaches) {
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
