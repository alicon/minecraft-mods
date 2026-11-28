import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import { hasDrySupport } from './expedition-navigation.mjs';

const OBSIDIAN = 'minecraft:obsidian';
const PORTAL = 'minecraft:nether_portal';
const AIR = /^(?:minecraft:)?(?:air|cave_air|void_air)$/;
const NETHER_GROUND = /^minecraft:(?:obsidian|netherrack|blackstone|basalt|smooth_basalt|soul_soil|cobblestone|nether_bricks)$/;
export const OVERWORLD = 'minecraft:overworld';
export const NETHER = 'minecraft:the_nether';
const OFFSETS = [[0, -1], [1, -1], [-1, 0], [2, 0], [-1, 1], [2, 1], [-1, 2], [2, 2], [0, 3], [1, 3]];
const INTERIOR = [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2]];

function atOffset([x, y, z], axis, along, up, normal = 0) {
  return axis === 'x' ? [x + along, y + up, z + normal] : [x + normal, y + up, z + along];
}

function distance(pos, player) {
  return Math.hypot(pos[0] + 0.5 - player.x, pos[1] - player.y, pos[2] + 0.5 - player.z);
}

export function findPortalFrame(cells, player, spareObsidian = 0) {
  const blocks = new Map(cells.map(({ x, y, z, b }) => [`${x},${y},${z}`, b]));
  const at = pos => blocks.get(pos.join(','));
  const air = pos => at(pos) === undefined || AIR.test(at(pos));
  const dry = pos => hasDrySupport(at(pos)) || NETHER_GROUND.test(at(pos) ?? '');
  const examined = new Set();
  const found = [];
  for (const { x, y, z, b } of cells) {
    if (b !== OBSIDIAN) continue;
    const block = [x, y, z];
    for (const axis of ['x', 'z']) {
      for (const [along, up] of OFFSETS) {
        const opening = atOffset(block, axis, -along, -up);
        const key = `${axis}:${opening}`;
        if (examined.has(key)) continue;
        examined.add(key);
        const ring = OFFSETS.map(([u, v]) => atOffset(opening, axis, u, v));
        const missing = ring.filter(pos => at(pos) !== OBSIDIAN);
        if (missing.length > spareObsidian || missing.some(pos => !air(pos))) continue;
        const room = INTERIOR.map(([u, v]) => atOffset(opening, axis, u, v));
        const lit = room.every(pos => at(pos) === PORTAL);
        if (!lit && !room.every(air)) continue;
        for (const side of [-1, 1]) {
          const approach = [1, 2, 3].map(n => atOffset(opening, axis, 0, 0, n * side));
          if (!approach.every(pos => air(pos) && air(atOffset(pos, axis, 0, 1))
              && dry(atOffset(pos, axis, 0, -1)))) continue;
          found.push({ opening, axis, missing, lit, landing: approach[2] });
        }
      }
    }
  }
  return found.sort((a, b) => Number(b.lit) - Number(a.lit) || a.missing.length - b.missing.length
    || distance(a.landing, player) - distance(b.landing, player))[0];
}

async function nearbyFrame(action, player, spareObsidian = 0) {
  const { x, y, z } = player.position;
  const area = await action('get_blocks', { center: [x, y, z].map(Math.floor), size: [19, 13, 19], format: 'json' });
  return area && findPortalFrame(area.cells, player.position, spareObsidian);
}

async function waitFor(action, predicate, description) {
  for (let check = 0; check < 100; check++) {
    const player = await action('observe');
    if (player?.inWorld && await predicate(player)) return player;
    await setTimeout(250);
  }
  throw new Error(description);
}

async function withCompanion(action, dimension, uuid) {
  return waitFor(action, async player => {
    if (player.dimension !== dimension) return false;
    const dogs = await action('get_entities', { type: 'mushroom_yorkie:mushroom_yorkie', radius: 24 });
    return dogs?.entities.some(dog => dog.uuid === uuid && dog.health > 0);
  }, `The player and original living Mushroom did not arrive together in ${dimension}`);
}

async function walk(action, pos) {
  const walk = await action('go_to', { pos, stopDistance: 0.3, maxTicks: 90 });
  assert.ok(walk?.arrived, `Could not safely walk to ${pos}: ${walk?.reason ?? 'interrupted'}`);
}

export async function netherRoundTrip(action, uuid, hold) {
  const start = await withCompanion(action, OVERWORLD, uuid);
  const stock = await action('get_inventory');
  const obsidian = stock.slots.filter(stack => stack.id === OBSIDIAN).reduce((total, stack) => total + stack.count, 0);
  const frame = await nearbyFrame(action, start, obsidian);
  assert.ok(frame, 'Could not find a complete or repairable standard Nether portal frame with a dry approach nearby');
  await walk(action, frame.landing);
  if (frame.missing.length) {
    await hold(action, OBSIDIAN);
    for (const pos of frame.missing) {
      const result = await action('place_block', { pos });
      assert.equal(result?.blockAtPos, OBSIDIAN, `Could not repair the portal frame at ${pos}`);
    }
  }
  if (!frame.lit) {
    await hold(action, 'minecraft:flint_and_steel');
    await action('interact_block', { pos: atOffset(frame.opening, frame.axis, 0, -1), face: 'up' });
    await waitFor(action, async () => {
      const lit = await action('get_blocks', { center: frame.opening, size: [1, 1, 1], format: 'json' });
      return lit?.cells.some(cell => cell.b === PORTAL);
    }, 'The obsidian frame did not light as a native Nether portal');
  }
  await walk(action, frame.opening);
  const arrived = await withCompanion(action, NETHER, uuid);
  const exit = await nearbyFrame(action, arrived);
  assert.ok(exit?.lit, 'Could not find the return portal with a dry landing');
  await walk(action, exit.landing);
  const { gameTime } = await action('observe');
  await waitFor(action, player => player.dimension === NETHER && player.gameTime >= gameTime + 320,
    'The Nether portal cooldown did not clear on dry ground');
  await walk(action, exit.opening);
  await withCompanion(action, OVERWORLD, uuid);
}
