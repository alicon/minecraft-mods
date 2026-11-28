import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import { hasDrySupport } from './expedition-navigation.mjs';
import { mineVisible, retreatFromNearbyMob, sleepNearby, stepOut } from './expedition-home.mjs';

const OBSIDIAN = 'minecraft:obsidian';
const PORTAL = 'minecraft:nether_portal';
const FLINT = 'minecraft:flint';
const STEEL = 'minecraft:flint_and_steel';
const FIRE_CHARGE = 'minecraft:fire_charge';
const INGOT = 'minecraft:iron_ingot';
const AIR = /^(?:minecraft:)?(?:air|cave_air|void_air)$/;
export const OVERWORLD = 'minecraft:overworld';
export const NETHER = 'minecraft:the_nether';
const OFFSETS = [[0, -1], [1, -1], [-1, 0], [2, 0], [-1, 1], [2, 1], [-1, 2], [2, 2], [0, 3], [1, 3]];
const INTERIOR = [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2]];
const feet = ({ position: { x, y, z } }) => [x, y, z].map(Math.floor);
const count = (stock, item) => stock.slots.filter(stack => stack.id === item).reduce((total, stack) => total + stack.count, 0);
const ignition = stock => [STEEL, FIRE_CHARGE].find(item => count(stock, item));

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
  const dry = pos => hasDrySupport(at(pos));
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
  const area = await action('get_blocks', { center: feet(player), size: [19, 13, 19], format: 'json' });
  return area && findPortalFrame(area.cells, player.position, spareObsidian);
}

export async function collectPortalLoot(action, pos) {
  if (!await action('look', { at: pos })) return false;
  const player = await action('observe');
  if (String(player?.crosshair?.pos) !== String(pos) || player.crosshair.block !== 'minecraft:chest') return false;
  const opened = await action('interact_block', { pos });
  if (opened?.screenOpened !== 'ContainerScreen') return false;
  try {
    for (const item of [OBSIDIAN, STEEL, FIRE_CHARGE, FLINT, INGOT]) {
      const view = await action('get_container');
      if (view?.slots.some(slot => slot.section === 'container' && slot.id === item)) {
        await action('transfer_items', { to: 'player', item });
      }
    }
  } finally {
    await action('stop', { closeScreen: true });
  }
  return true;
}

export async function prepareNetherPortal(action, craft, camp) {
  const visited = [];
  const rejectedSteps = new Set();
  const looted = new Set();
  const mined = new Set();
  const skippedRuins = [];
  let nextSleepCheck = 0;
  for (let attempt = 0; attempt < 150; attempt++) {
    const player = await action('observe');
    assert.ok(player?.inWorld && !player.dead && player.health >= 8, 'Ruined portal scouting became unsafe');
    const here = feet(player);
    if (await retreatFromNearbyMob(action, player, visited, rejectedSteps)) continue;
    if (player.gameTime >= nextSleepCheck) {
      nextSleepCheck = player.gameTime + 300;
      if (await sleepNearby(action, player)) continue;
    }
    const stock = await action('get_inventory');
    const budget = count(stock, OBSIDIAN);
    const area = await action('get_blocks', { center: here, size: [19, 13, 19], format: 'json' });
    const frame = findPortalFrame(area.cells, player.position, budget);
    const lighter = ignition(stock);
    if (frame && (frame.lit || lighter)) return { frame, lighter };
    if (frame && count(stock, FLINT) && count(stock, INGOT)) {
      await craft(STEEL, 1);
      assert.ok(count(await action('get_inventory'), STEEL), 'Flint and steel did not arrive in the inventory');
      return { frame, lighter: STEEL };
    }

    const nearObsidian = area.cells.filter(cell => cell.b === OBSIDIAN).map(({ x, y, z }) => [x, y, z]);
    const chest = area.cells.filter(cell => cell.b === 'minecraft:chest')
      .map(({ x, y, z }) => [x, y, z]).filter(pos => !looted.has(String(pos))
        && nearObsidian.some(block => Math.hypot(...block.map((n, axis) => n - pos[axis])) <= 7))
      .sort((a, b) => distance(a, player.position) - distance(b, player.position))[0];
    if (chest && distance(chest, player.position) < 3.8) {
      if (await collectPortalLoot(action, chest)) {
        looted.add(String(chest));
        continue;
      }
    }
    let destination = chest;
    if (!chest && frame && !lighter && count(stock, INGOT)) {
      if (await mineVisible(action, camp?.bed ?? here, mined, new Set(['minecraft:gravel']), new Set([FLINT]))) continue;
      const gravel = await action('scan_blocks', { blocks: ['gravel'], radius: 16, max: 24 });
      destination = gravel?.matches.flatMap(match => match.positions)
        .filter(pos => !mined.has(String(pos)) && Math.abs(pos[1] - here[1]) <= 3)
        .sort((a, b) => distance(a, player.position) - distance(b, player.position))[0];
    }
    if (!destination) {
      const scan = await action('scan_blocks', { blocks: [OBSIDIAN], radius: 32, max: 64 });
      destination = scan?.matches.flatMap(match => match.positions)
        .filter(pos => Math.abs(pos[1] - here[1]) <= 5
          && !skippedRuins.some(skip => Math.hypot(skip[0] - pos[0], skip[2] - pos[2]) < 8))
        .sort((a, b) => distance(a, player.position) - distance(b, player.position))[0];
      if (destination && distance(destination, player.position) < 5) {
        skippedRuins.push(destination);
        destination = undefined;
      }
    }
    visited.push(here);
    if (!await stepOut(action, player, visited, destination, undefined, rejectedSteps) && destination) {
      if (chest) looted.add(String(chest));
      else skippedRuins.push(destination);
    }
  }
  throw new Error('No repairable portal, reachable chest and ignition were earned during the Overworld search');
}

async function waitFor(action, predicate, description) {
  for (let check = 0; check < 100; check++) {
    const player = await action('observe');
    if (player?.inWorld && await predicate(player)) return player;
    await setTimeout(250);
  }
  throw new Error(description);
}

export async function withCompanion(action, dimension, uuid) {
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

export async function netherRoundTrip(action, uuid, hold, prepare, startDimension = OVERWORLD, workInNether) {
  if (startDimension === OVERWORLD) {
    await withCompanion(action, OVERWORLD, uuid);
    const { frame, lighter } = await prepare();
    await walk(action, frame.landing);
    if (frame.missing.length) {
      await hold(action, OBSIDIAN);
      for (const pos of frame.missing) {
        const result = await action('place_block', { pos });
        assert.equal(result?.blockAtPos, OBSIDIAN, `Could not repair the portal frame at ${pos}`);
      }
    }
    if (!frame.lit) {
      assert.ok(lighter, 'The expedition has no ignition for the repaired portal');
      await hold(action, lighter);
      await action('interact_block', { pos: atOffset(frame.opening, frame.axis, 0, -1), face: 'up' });
      await waitFor(action, async () => {
        const lit = await action('get_blocks', { center: frame.opening, size: [1, 1, 1], format: 'json' });
        return lit?.cells.some(cell => cell.b === PORTAL);
      }, 'The obsidian frame did not light as a native Nether portal');
    }
    await walk(action, frame.opening);
  }
  const arrived = await withCompanion(action, NETHER, uuid);
  const exit = await nearbyFrame(action, arrived);
  assert.ok(exit?.lit, 'Could not find the return portal with a dry landing');
  await walk(action, exit.landing);
  const { gameTime } = await action('observe');
  await waitFor(action, player => player.dimension === NETHER && player.gameTime >= gameTime + 320,
    'The Nether portal cooldown did not clear on dry ground');
  if (workInNether) {
    await workInNether(exit);
    await walk(action, exit.landing);
  }
  await walk(action, exit.opening);
  await withCompanion(action, OVERWORLD, uuid);
}
