import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import { bowAim, clearBowArc } from './expedition-ballistics.mjs';
import { dogMealCount, eatExpeditionMeal, feedAdoptedDog, hold, hunt, stepOut } from './expedition-home.mjs';
import { markExpeditionCamp, useEmptyHandOnCompanion } from './expedition-gear.mjs';
import { hasDrySupport, nearestCover } from './expedition-navigation.mjs';

const ROD = 'minecraft:blaze_rod';
const POWDER = 'minecraft:blaze_powder';
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

export function blazePowderCount(stock) {
  return stock.slots.reduce((sum, item) => sum + (item.id === POWDER ? item.count : 0), 0);
}

export async function craftBlazePowder(action, craft, wanted) {
  const stock = await action('get_inventory');
  const powder = blazePowderCount(stock);
  const requiredRods = Math.max(0, Math.ceil((wanted - powder) / 2));
  assert.ok(rods(stock) >= requiredRods, 'The Nether trip did not yield enough blaze rods');
  if (requiredRods) await craft(POWDER, requiredRods * 2);
  assert.ok(blazePowderCount(await action('get_inventory')) >= wanted, 'Native crafting did not yield the expected blaze powder');
}

async function shootBlaze(action, player, blaze) {
  const target = [blaze.pos[0], blaze.pos[1] + 0.85, blaze.pos[2]];
  const aim = bowAim(player, target);
  if (!aim) return false;
  const neighborhood = await action('get_entities', { radius: 28, max: 96 });
  if (!neighborhood) return false;
  const bystanders = neighborhood.entities.filter(entity => entity.type === DOG || entity.type === 'minecraft:zombified_piglin');
  if (bystanders.some(entity => distance(entity.pos, target) < 2.5)
      || !clearBowArc(player, target, ([x, y, z]) => bystanders.some(({ pos }) =>
        Math.abs(x + 0.5 - pos[0]) <= 1.5 && Math.abs(z + 0.5 - pos[2]) <= 1.5 && Math.abs(y - pos[1]) <= 2))) {
    return false;
  }
  await hold(action, BOW);
  if (!await action('look', aim) || !(await action('use_item', { ticks: 24 }))?.completed) return false;
  await setTimeout(450);
  const view = await action('get_entities', { type: BLAZE, radius: 28 });
  if (!view) return false;
  const observedBlaze = view.entities.find(entity => entity.uuid === blaze.uuid);
  return !observedBlaze || observedBlaze.health < blaze.health;
}

async function returnToShelter(action, landing, tolerance = 1, escortUuid) {
  const visited = [];
  const rejected = new Set();
  for (let attempt = 0; attempt < 36; attempt++) {
    const player = await action('observe');
    assert.ok(player?.inWorld && !player.dead, 'The player is no longer in the Nether shelter route');
    const here = feet(player);
    if (escortUuid) {
      const view = await action('get_entities', { type: DOG, radius: 24 });
      const dog = view?.entities.find(entity => entity.uuid === escortUuid && entity.health > 0);
      if (!dog || dog.distance > 4) {
        await setTimeout(300);
        continue;
      }
    }
    if (player.onGround && distance(here, landing) <= tolerance) return;
    visited.push(here);
    await stepOut(action, player, visited, landing, undefined, rejected, undefined, undefined, escortUuid ? 18 : 90);
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

async function observedFortress(action, here) {
  const scan = await action('scan_blocks', { blocks: FORTRESS, radius: 32, max: 36 });
  return scan?.matches.flatMap(match => match.positions)
    .filter(pos => Math.abs(pos[1] - here[1]) <= 6)
    .sort((a, b) => distance(a, here) - distance(b, here))[0];
}

async function scoutNetherFortress(action, uuid, exit) {
  const first = await observedFortress(action, exit.landing);
  if (first && distance(first, exit.landing) < 21) {
    return { shelter: await findNetherShelter(action, exit), trail: [] };
  }

  const visited = [];
  const rejected = new Set();
  const trail = [exit.landing];
  let nextMeal = 0;
  let blocked = 0;
  let regroupChecks = 0;
  let lastDogPosition;
  for (let attempt = 0; attempt < 120; attempt++) {
    const player = await action('observe');
    assert.ok(player?.inWorld && !player.dead && player.health >= 10 && !player.onFire, 'Fortress scouting became unsafe');
    if (!player.onGround) {
      await setTimeout(125);
      continue;
    }
    const here = feet(player);
    const dogs = await action('get_entities', { type: DOG, radius: 48 });
    const dog = dogs?.entities.find(entity => entity.uuid === uuid && entity.health > 0);
    if (dog) lastDogPosition = dog.pos.map(Math.floor);
    if (!dog || dog.distance > 6) {
      if (++regroupChecks >= 18) throw new Error('The original Mushroom could not regroup on the fortress approach');
      if (lastDogPosition && regroupChecks % 6 === 0) await returnToShelter(action, lastDogPosition, 3);
      await setTimeout(300);
      continue;
    }
    regroupChecks = 0;
    const stock = await action('get_inventory');
    if (dog.health <= 9 && player.gameTime >= nextMeal && dogMealCount(stock)) {
      await feedAdoptedDog(action, uuid, here, 10);
      nextMeal = player.gameTime + 180;
      continue;
    }
    const meal = FOOD.find(item => hasItem(stock, item));
    if (meal && player.food < 18 && player.health < 16 && await eatExpeditionMeal(action, player, meal)) continue;
    const fortress = await observedFortress(action, here);
    if (fortress && distance(fortress, here) <= 17) {
      const ground = await action('get_blocks', { center: here, size: [19, 9, 19], format: 'json' });
      const shelter = ground && nearestCover(ground.cells, here);
      if (shelter && distance(shelter, fortress) >= 7 && distance(shelter, exit.opening) >= 6) {
        return { shelter, trail: trail.reverse() };
      }
    }
    if (distance(trail.at(-1), here) >= 5) trail.push(here);
    visited.push(here);
    if (await stepOut(action, player, visited, fortress, undefined, rejected)) blocked = 0;
    else if (++blocked >= 4) break;
  }
  throw new Error('No dry route reached a covered camp near observed fortress blocks');
}

async function parkCompanion(action, uuid, opening, shelter) {
  await returnToShelter(action, shelter, 0, uuid);
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
  if (rods(await action('get_inventory')) >= wanted) return;
  const { shelter, trail } = await scoutNetherFortress(action, uuid, exit);
  const { mat, dog: shelteredDog } = await parkCompanion(action, uuid, exit.opening, shelter);
  const visited = [];
  const rejected = new Set();
  let fortress;
  let nextSurvey = 0;
  for (let attempt = 0; attempt < 55 + wanted * 10; attempt++) {
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
      fortress = await observedFortress(action, here);
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
  for (const waypoint of trail) await returnToShelter(action, waypoint, 1, uuid);
  return mat;
}
