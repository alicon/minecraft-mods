import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import { bowAim } from './expedition-ballistics.mjs';
import { eatExpeditionMeal, hold, hunt, stepOut } from './expedition-home.mjs';
import { markExpeditionCamp, useEmptyHandOnCompanion } from './expedition-gear.mjs';
import { hasDrySupport } from './expedition-navigation.mjs';

const ROD = 'minecraft:blaze_rod';
const BLAZE = 'minecraft:blaze';
const BOW = 'minecraft:bow';
const ARROW = 'minecraft:arrow';
const DOG = 'mushroom_yorkie:mushroom_yorkie';
const FORTRESS = ['minecraft:nether_bricks', 'minecraft:nether_brick_fence'];
const FOOD = ['minecraft:cooked_beef', 'minecraft:cooked_mutton', 'minecraft:cooked_porkchop', 'minecraft:bread'];
const feet = ({ position: { x, y, z } }) => [x, y, z].map(Math.floor);
const distance = (a, b) => Math.hypot(...a.map((axis, index) => axis - b[index]));
const rods = stock => stock.slots.reduce((sum, item) => sum + (item.id === ROD ? item.count : 0), 0);
const hasItem = (stock, id) => stock.slots.some(stack => stack.id === id);

async function shootBlaze(action, player, blaze) {
  const aim = bowAim(player, [blaze.pos[0], blaze.pos[1] + 0.85, blaze.pos[2]]);
  if (!aim) return false;
  await hold(action, BOW);
  if (!await action('look', aim) || !(await action('use_item', { ticks: 24 }))?.completed) return false;
  await setTimeout(450);
  const view = await action('get_entities', { type: BLAZE, radius: 28 });
  if (!view) return false;
  const target = view.entities.find(entity => entity.uuid === blaze.uuid);
  return !target || target.health < blaze.health;
}

async function returnToShelter(action, landing, tolerance = 1) {
  const visited = [];
  const rejected = new Set();
  for (let attempt = 0; attempt < 36; attempt++) {
    const player = await action('observe');
    assert.ok(player?.inWorld && !player.dead, 'The player is no longer in the Nether shelter route');
    const here = feet(player);
    if (player.onGround && distance(here, landing) <= tolerance) return;
    visited.push(here);
    await stepOut(action, player, visited, landing, undefined, rejected);
  }
  throw new Error('Could not return to Mushroom at the Nether shelter');
}

async function restAtShelter(action, landing) {
  await returnToShelter(action, landing);
  for (let watch = 0; watch < 90; watch++) {
    const player = await action('observe');
    assert.ok(player?.inWorld && !player.dead, 'The player did not survive the retreat');
    if (player.health >= 17 && !player.onFire) return;
    if (player.food < 20) {
      const stock = await action('get_inventory');
      const meal = FOOD.find(item => hasItem(stock, item));
      if (meal) await eatExpeditionMeal(action, player, meal);
    }
    await setTimeout(500);
  }
  throw new Error('The player could not recover at the Nether shelter');
}

async function findNetherShelter(action, { opening, axis, landing }) {
  const view = await action('get_blocks', { center: landing, size: [15, 5, 15], format: 'json' });
  const blocks = new Map(view.cells.map(({ x, y, z, b }) => [String([x, y, z]), b]));
  const lateral = axis === 'x' ? 0 : 2;
  const sites = view.cells.flatMap(({ x, y, z, b }) => {
    const spot = [x, y + 1, z];
    if (spot[1] !== landing[1] || distance(spot, opening) < 6 || distance(spot, landing) > 6
        || Math.abs(spot[lateral] - landing[lateral]) < 3 || !hasDrySupport(b)
        || blocks.has(String(spot)) || blocks.has(String([x, y + 2, z]))) return [];
    return [spot];
  }).sort((a, b) => distance(a, landing) - distance(b, landing));
  assert.ok(sites.length, 'Could not find dry shelter outside the Nether portal approach');
  return sites[0];
}

async function parkCompanion(action, uuid, opening, shelter) {
  await returnToShelter(action, shelter, 0);
  const mat = await markExpeditionCamp(action);
  for (let attempt = 0; attempt < 24; attempt++) {
    const nearby = await action('get_entities', { type: DOG, radius: 12 });
    const dog = nearby?.entities.find(entity => entity.uuid === uuid && entity.health > 0);
    if (dog?.distance <= 3 && distance(dog.pos, opening) >= 4) {
      await useEmptyHandOnCompanion(action, uuid);
      return { mat, dog };
    }
    await setTimeout(250);
  }
  throw new Error('Mushroom did not reach dry ground away from the Nether portal');
}

export async function earnBlazeRods(action, uuid, exit, wanted) {
  const shelter = await findNetherShelter(action, exit);
  const { mat, dog: shelteredDog } = await parkCompanion(action, uuid, exit.opening, shelter);
  const visited = [];
  const rejected = new Set();
  let fortress;
  let nextSurvey = 0;
  for (let attempt = 0; attempt < 65; attempt++) {
    const stock = await action('get_inventory');
    if (rods(stock) >= wanted) break;
    const player = await action('observe');
    assert.ok(player?.inWorld && !player.dead, 'The player did not survive the blaze hunt');
    if (player.onFire || player.health < 14) {
      await restAtShelter(action, shelter);
      continue;
    }
    const here = feet(player);
    const food = FOOD.find(item => stock.slots.some(stack => stack.id === item));
    if (food && player.food <= 16 && player.health < 16 && await eatExpeditionMeal(action, player, food)) continue;
    const enemies = await action('get_entities', { type: BLAZE, radius: 28, max: 12 });
    const blaze = enemies?.entities.find(entity => distance(entity.pos, shelteredDog.pos) >= 7);
    const drops = await action('get_entities', { type: 'item', radius: 24 });
    const drop = drops?.entities.find(entity => entity.item?.id === ROD && Math.abs(entity.pos[1] - here[1]) <= 2);
    if (drop?.distance <= 6) {
      await action('go_to', { entityId: drop.id, stopDistance: 0.3, maxTicks: 50 });
      if (rods(await action('get_inventory')) > rods(stock)) continue;
    }
    const ranged = hasItem(stock, BOW) && hasItem(stock, ARROW);
    if (!drop && ranged && blaze?.distance >= 6 && blaze.distance <= 16
        && await shootBlaze(action, player, blaze)) continue;
    if (!drop && blaze?.distance <= (ranged ? 4 : 7) && Math.abs(blaze.pos[1] - here[1]) <= 2.5
        && await hunt(action, blaze, item => item === ROD, async () => (await action('observe'))?.health >= 10)) continue;
    if (!blaze && attempt >= nextSurvey) {
      nextSurvey = attempt + 5;
      const scan = await action('scan_blocks', { blocks: FORTRESS, radius: 28, max: 12 });
      fortress = scan?.matches.flatMap(match => match.positions)
        .filter(pos => Math.abs(pos[1] - here[1]) <= 6)
        .sort((a, b) => distance(a, here) - distance(b, here))[0];
    }
    visited.push(here);
    const awayFromCamp = distance(here, shelter);
    if (awayFromCamp > 36 && !blaze) break;
    const scout = await action('observe');
    await stepOut(action, scout, visited, drop?.pos ?? blaze?.pos ?? fortress, undefined, rejected);
  }
  await returnToShelter(action, shelter);
  await useEmptyHandOnCompanion(action, uuid);
  assert.ok(rods(await action('get_inventory')) >= wanted, 'Could not earn the required blaze rods');
  return mat;
}
