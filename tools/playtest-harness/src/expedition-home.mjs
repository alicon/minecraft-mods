import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import {
  bedSpotsWithGroundCover, dryStepKey, dryWaypoint, hasPlacedBed, leavesBlockingExit, nearbyBuildingSpots,
  nearestCover, quarryStep,
} from './expedition-navigation.mjs';
import { cookExpeditionMutton, makeExpeditionCharcoal, smeltExpeditionIron } from './expedition-furnace.mjs';
import { enterShelter, findShelteredBed, useShelterDoor } from './expedition-shelter.mjs';

export const WOOD_LOGS = ['oak', 'birch', 'spruce', 'acacia', 'dark_oak', 'jungle', 'cherry', 'pale_oak', 'mangrove']
  .map(wood => `${wood}_log`);
const WOOL = /^minecraft:(.+)_wool$/;
const MUTTON = 'minecraft:mutton';
const FIELD_GUIDE = 'mushroom_yorkie:field_guide';
const DOG = 'mushroom_yorkie:mushroom_yorkie';
const PICKAXE = 'minecraft:wooden_pickaxe';
const STONE_PICKAXE = 'minecraft:stone_pickaxe';
const COBBLESTONE = 'minecraft:cobblestone';
const FURNACE = 'minecraft:furnace';
const RAW_IRON = 'minecraft:raw_iron';
const IRON_INGOT = 'minecraft:iron_ingot';
const COAL = 'minecraft:coal';
const CHARCOAL = 'minecraft:charcoal';
const IRON_RECIPES = [
  ['minecraft:iron_pickaxe', 3], ['minecraft:bucket', 3], ['minecraft:shield', 1],
];
const SWORDS = ['minecraft:stone_sword', 'minecraft:wooden_sword'];
const CAMP_WORK_END = 11_900;
const BACKUP_MEAT = {
  'minecraft:cow': 'minecraft:beef',
  'minecraft:pig': 'minecraft:porkchop',
};
const BACKUP_FOOD = [...Object.values(BACKUP_MEAT), 'minecraft:apple'];
const COOKED_FOOD = ['minecraft:cooked_mutton', 'minecraft:cooked_beef', 'minecraft:cooked_porkchop'];
const DOG_FOOD = [MUTTON, ...BACKUP_FOOD, ...COOKED_FOOD];
const FEEDING_SEARCH_RADIUS = 24;
const WOOL_DYES = {
  white: ['minecraft:lily_of_the_valley', 'minecraft:bone_meal'],
  yellow: ['minecraft:dandelion'],
  red: ['minecraft:poppy', 'minecraft:red_tulip'],
  light_gray: ['minecraft:oxeye_daisy', 'minecraft:azure_bluet', 'minecraft:white_tulip'],
};

function isBedtime(player) {
  return player?.dimension === 'minecraft:overworld' && player.timeOfDay >= 12_542 && player.timeOfDay < 23_460;
}

function count({ slots }, item) {
  return slots.reduce((total, stack) => total + (stack.id === item ? stack.count : 0), 0);
}

function woolColor(inventory) {
  const colors = new Set(inventory.slots.map(({ id }) => WOOL.exec(id)?.[1]).filter(Boolean));
  return [...colors].find(color => count(inventory, `minecraft:${color}_wool`) >= 3);
}

export async function matchWoolWithDye(action, craft, inventory) {
  if (inventory.slots.filter(stack => WOOL.test(stack.id)).reduce((total, stack) => total + stack.count, 0) < 3) return;
  const options = Object.entries(WOOL_DYES).map(([color, ingredients]) => {
    const wool = `minecraft:${color}_wool`;
    const dye = `minecraft:${color}_dye`;
    const missing = 3 - count(inventory, wool);
    return { color, wool, dye, missing, stock: count(inventory, dye),
      ingredients: ingredients.reduce((total, item) => total + count(inventory, item), 0) };
  }).filter(option => option.missing > 0 && option.stock + option.ingredients >= option.missing)
    .sort((a, b) => a.missing - b.missing);
  const recipe = options[0];
  if (!recipe) return;
  if (recipe.stock < recipe.missing) await craft(recipe.dye, recipe.missing - recipe.stock);
  await craft(recipe.wool, recipe.missing);
  const after = await action('get_inventory');
  assert.ok(count(after, recipe.wool) >= 3, 'The native dye recipe did not produce three matching blocks');
  return recipe.color;
}

async function findDyeFlower(action, player, stock, tried) {
  const plants = Object.values(WOOL_DYES).flat().filter(item => !item.endsWith('bone_meal'));
  const scan = await action('scan_blocks', { blocks: plants, radius: 24, max: 12 });
  const { x, y, z } = player.position;
  return scan?.matches.flatMap(({ name, positions }) => positions.map(pos => ({ name, pos,
    distance: Math.hypot(pos[0] + 0.5 - x, pos[1] - y, pos[2] + 0.5 - z),
  }))).filter(item => Math.abs(item.pos[1] - y) < 3 && !tried.has(String(item.pos)))
    .sort((a, b) => {
      const score = flower => {
        const color = Object.keys(WOOL_DYES).find(key => WOOL_DYES[key].includes(flower.name));
        return flower.distance + (3 - count(stock, `minecraft:${color}_wool`)) * 5;
      };
      return score(a) - score(b);
    })[0];
}

async function collectFlower(action, player, flower) {
  const [fx, fy, fz] = flower.pos;
  const dx = fx + 0.5 - player.position.x;
  const dz = fz + 0.5 - player.position.z;
  const dy = fy + 0.2 - player.position.y - 1.62;
  await action('look', { yaw: Math.atan2(-dx, dz) * 180 / Math.PI, pitch: -Math.atan2(dy, Math.hypot(dx, dz)) * 180 / Math.PI });
  await setTimeout(100);
  if ((await action('observe'))?.crosshair?.pos?.join(',') !== flower.pos.join(',')) return false;
  if (!(await action('break_block', { pos: flower.pos, maxTicks: 25 }))?.broken) return false;
  await setTimeout(180);
  const drops = await action('get_entities', { type: 'item', radius: 5 });
  const item = drops?.entities.find(candidate => candidate.item?.id === flower.name);
  if (item) await action('go_to', { entityId: item.id, stopDistance: 0.3, maxTicks: 30 });
  return true;
}

export async function hold(action, item) {
  const inventory = await action('get_inventory');
  const stack = inventory.slots.filter(entry => entry.id === item)
    .sort((first, second) => durability(second) - durability(first))[0];
  assert.ok(stack, `Missing ${item}`);
  let slot = stack.slot;
  if (slot >= 9) {
    const menu = await action('get_container');
    const carried = menu?.slots.find(entry => entry.section === 'player' && entry.invSlot === slot);
    assert.ok(carried, `Cannot move ${item} to the hotbar`);
    slot = inventory.selectedSlot;
    await action('click_slot', { slot: carried.slot, action: 'swap', hotbar: slot });
  }
  const selected = await action('select_slot', { slot });
  assert.equal(selected?.mainHand?.id, item);
}

function durability(stack) {
  return (stack.maxDamage ?? 0) - (stack.damage ?? 0);
}

function feet(player) {
  return [player.position.x, player.position.y, player.position.z].map(Math.floor);
}

export async function visible(action, entityId) {
  if (!await action('look', { entityId })) return false;
  await setTimeout(110);
  return (await action('observe'))?.crosshair?.id === entityId;
}

export async function hunt(action, animal, dropMatches) {
  const inventory = await action('get_inventory');
  const sword = SWORDS.find(item => count(inventory, item) > 0);
  // Mining tools lose extra durability in combat. Keep the pickaxe for
  // daylight construction even if the player has to finish by hand.
  if (sword) {
    await hold(action, sword);
  } else if (inventory.mainHand?.id === PICKAXE) {
    const empty = Array.from({ length: 9 }, (_, slot) => slot)
      .find(slot => !inventory.slots.some(stack => stack.slot === slot));
    const alternate = inventory.slots.find(stack => stack.slot < 9 && stack.id !== PICKAXE);
    if (empty !== undefined || alternate) {
      await action('select_slot', { slot: empty ?? alternate.slot });
    }
  }
  for (let hit = 0; hit < 12; hit++) {
    const present = (await action('get_entities', { type: animal.type, radius: 8 })).entities
      .some(entity => entity.id === animal.id);
    if (!present) return false;
    const near = await action('go_to', { entityId: animal.id, stopDistance: 1.65, maxTicks: 40 });
    if (!near?.arrived || !await visible(action, animal.id)) return false;
    await action('attack_entity', { entityId: animal.id });
    await setTimeout(725);
    const { entities } = await action('get_entities', { type: animal.type, radius: 16 });
    if (!entities.some(entity => entity.id === animal.id)) {
      const drops = await action('get_entities', { type: 'item', radius: 6 });
      for (const drop of drops.entities.filter(drop => dropMatches(drop.item?.id))) {
        await action('go_to', { entityId: drop.id, stopDistance: 0.3, maxTicks: 65 });
      }
      await setTimeout(350);
      return true;
    }
  }
  return false;
}

export async function stepOut(action, player, visited, destination, preferredGround, rejectedSteps = new Set(), chooseRoute, avoid) {
  const center = feet(player);
  const width = preferredGround || chooseRoute ? 23 : 17;
  const volume = await action('get_blocks', { center, size: [width, 9, width], format: 'json' });
  let pos = dryWaypoint(volume.cells, center, visited, destination, preferredGround, rejectedSteps, avoid);
  if (avoid && !pos) return false;
  const repeated = visited.filter(tile => tile.every((coordinate, axis) => coordinate === center[axis])).length > 2;
  if (!pos || repeated) {
    const leaf = leavesBlockingExit(volume.cells, center);
    if (leaf && (await action('break_block', { pos: leaf, maxTicks: 30 }))?.broken) return true;
    if (!pos) return false;
  }
  if (chooseRoute) {
    const exits = new Set(rejectedSteps);
    const routes = [];
    for (let route = pos; route && routes.length < 3;) {
      const [x, y, z] = route;
      routes.push({
        pos: route,
        revisits: visited.filter(([vx, , vz]) => vx === x && vz === z).length,
        surface: volume.cells.find(cell => cell.x === x && cell.y === y - 1 && cell.z === z)?.b,
      });
      exits.add(dryStepKey(center, route));
      route = dryWaypoint(volume.cells, center, visited, destination, preferredGround, exits, avoid);
    }
    pos = (await chooseRoute(player, routes, destination)).pos;
  }
  const result = await action('go_to', { pos, stopDistance: 0.3, maxTicks: 90 });
  const wrongHeight = result?.arrived && Math.abs(result.position?.[1] - pos[1]) >= 0.9
    && !await settleOnDryStep(action, pos);
  const moved = result?.arrived || Math.hypot(result?.position?.[0] - player.position.x,
    result?.position?.[2] - player.position.z) >= 0.6;
  if (wrongHeight || (!moved && result?.reason)) rejectedSteps.add(dryStepKey(center, pos));
  return !wrongHeight && moved;
}

export async function retreatFromNearbyMob(action, player, visited, rejectedSteps) {
  // A scouting walk can cover ten blocks before the next observation.
  const threat = player.threats?.find(entity => entity.distance <= (entity.type === 'minecraft:creeper' ? 16 : 7)
    && (entity.type !== 'minecraft:spider' || isBedtime(player)));
  if (!threat) return false;
  const nearby = await action('get_entities', { type: threat.type, radius: 18, max: 16 });
  const danger = nearby?.entities.find(entity => entity.id === threat.id && entity.hostile);
  if (!danger) return false;
  const here = feet(player);
  const away = [here[0] + 8 * Math.sign(player.position.x - danger.pos[0]), here[1],
    here[2] + 8 * Math.sign(player.position.z - danger.pos[2])];
  visited.push(here);
  if (await stepOut(action, player, visited, away, undefined, rejectedSteps, undefined, danger.pos)) return true;
  if (threat.type !== 'minecraft:creeper') return false;
  await action('stop');
  await setTimeout(250);
  return true;
}

export async function gatherWool(action, descendFromCanopy, chooseRoute, craft, reportScouting) {
  const visited = [];
  const rejectedSteps = new Set();
  const triedAnimals = new Map();
  const triedFlowers = new Set();
  const blockedShelters = new Set();
  let shelter;
  let shelterSteps = 0;
  let stalls = 0;
  // The first flock can come into range after several minutes of safe scouting.
  for (let round = 0; round < 400; round++) {
    const inventory = await action('get_inventory');
    const color = woolColor(inventory);
    if (color) return color;
    const dyed = craft && await matchWoolWithDye(action, craft, inventory);
    if (dyed) return dyed;

    const player = await action('observe');
    assert.ok(player?.inWorld && !player.dead && player.health > 4, 'Sheep search ran out of safe health');
    if (await retreatFromNearbyMob(action, player, visited, rejectedSteps)) continue;
    const meal = BACKUP_FOOD.find(item => count(inventory, item) > 0)
      ?? (count(inventory, MUTTON) > (player.food <= 8 ? 0 : 1) ? MUTTON : undefined);
    if (player.food <= 16 && meal) {
      await hold(action, meal);
      await action('use_item', { ticks: 36 });
    }
    if (craft && !shelter && round % 8 === 0) {
      shelter = await findShelteredBed(action, player, blockedShelters);
      shelterSteps = 0;
    }
    if (shelter && player.food > 10) {
      await reportScouting?.('Found a sheltered bed. Looking for a dry approach to the door.');
      const here = feet(player);
      if (here.join(',') === shelter.entrance.join(',')) {
        if (await enterShelter(action, shelter)) return shelter;
      } else if (shelterSteps++ < 20) {
        visited.push(here);
        if (await stepOut(action, player, visited, shelter.entrance, undefined, rejectedSteps)) continue;
      }
      blockedShelters.add(String(shelter.bed));
      shelter = undefined;
    }
    const nearby = await action('get_entities', { type: 'sheep', radius: 96, max: 16 });
    const sheep = nearby.entities.find(entity => (triedAnimals.get(entity.id) ?? -10) < round - 3
      && Math.abs(entity.pos[1] - player.position.y) <= 8);
    let target = sheep;
    if (!meal && player.food <= 15) {
      const { entities } = await action('get_entities', { radius: 24, max: 64 });
      const food = entities.find(entity => BACKUP_MEAT[entity.type] && Math.abs(entity.pos[1] - player.position.y) <= 3
        && (triedAnimals.get(entity.id) ?? -10) < round - 3);
      if (food && (!sheep || food.distance + (player.food <= 8 ? 0 : 5) < sheep.distance)) target = food;
    }
    if (target?.distance <= 6) {
      triedAnimals.set(target.id, round);
      const earns = target === sheep ? item => WOOL.test(item) || item === MUTTON : item => item === BACKUP_MEAT[target.type];
      if (await hunt(action, target, earns)) continue;
    }
    const mixed = craft && inventory.slots.filter(stack => WOOL.test(stack.id)).reduce((total, stack) => total + stack.count, 0) >= 3;
    const flower = mixed && (meal || player.food > 12) && target === sheep
      ? await findDyeFlower(action, player, inventory, triedFlowers) : null;
    if (flower && (!target || flower.distance < target.distance)) {
      if (flower.distance < 3.6) {
        triedFlowers.add(String(flower.pos));
        if (await collectFlower(action, player, flower)) continue;
      } else {
        target = flower;
      }
    }
    const here = await action('observe');
    const next = target === sheep ? 'No sheep nearby. Looking for open grassland.'
      : flower === target ? 'Looking for dye to make the wool match.'
        : 'Looking for food before continuing the wool search.';
    await reportScouting?.(sheep && target === sheep
      ? `Saw a sheep about ${Math.round(sheep.distance)} blocks away. Following dry ground toward it.` : next);
    visited.push(feet(here));
    if (await stepOut(action, here, visited, target?.pos, target ? undefined : 'grass', rejectedSteps,
      target === sheep ? chooseRoute : undefined)
        || await descendFromCanopy(here)) {
      stalls = 0;
    } else {
      stalls++;
      assert.ok(stalls < 5, 'Could not find a dry way out while looking for sheep');
    }
  }
  throw new Error('Sheep search ended before earning three matching wool blocks');
}

export async function placeBeside(action, item) {
  await hold(action, item);
  const player = await action('observe');
  const { cells } = await action('get_blocks', { center: feet(player), size: [11, 5, 11], format: 'json' });
  const bed = item.endsWith('_bed');
  const spots = nearbyBuildingSpots(cells, player.position, bed).map(pos => ({ pos, clear: [] }));
  if (bed) spots.push(...bedSpotsWithGroundCover(cells, player.position));
  for (const { pos, clear } of spots) {
    for (const cover of clear) await action('break_block', { pos: cover, maxTicks: 25 });
    const result = await action('place_block', { pos });
    if (!result?.placed || result.blockAtPos !== item) continue;
    if (!bed) return pos;
    await setTimeout(300);
    const placed = await action('get_blocks', { center: pos, size: [3, 1, 3], format: 'json' });
    if (hasPlacedBed(placed.cells, pos, item)) return pos;

    const { entities } = await action('get_entities', { type: 'item', radius: 8 });
    const droppedBed = entities.find(entity => entity.item?.id === item);
    if (droppedBed) await action('go_to', { entityId: droppedBed.id, stopDistance: 0.3, maxTicks: 45 });
    if (!count(await action('get_inventory'), item)) {
      throw new Error(`Native placement consumed the ${item} without leaving a complete bed at ${pos}`);
    }
    await hold(action, item);
  }
  throw new Error(`No nearby supported position for ${item}`);
}

async function harvestReachableLog(action, camp) {
  const { position } = await action('observe');
  const wood = await action('scan_blocks', { blocks: WOOD_LOGS, radius: 12, max: 40 });
  const candidates = wood.matches.flatMap(({ name, positions }) => positions.map(pos => ({ name, pos })))
    .filter(({ pos }) => Math.abs(pos[1] - position.y) < 2.5)
    .filter(({ pos }) => !camp || Math.hypot(...pos.map((axis, index) => axis - camp[index])) <= 9)
    .sort((a, b) => Math.hypot(a.pos[0] - position.x, a.pos[2] - position.z)
      - Math.hypot(b.pos[0] - position.x, b.pos[2] - position.z));
  for (const tree of candidates.slice(0, 8)) {
    const approached = await action('go_to', { pos: tree.pos, stopDistance: 2.1, maxTicks: 65 });
    if (!approached?.arrived) continue;
    await action('look', { at: tree.pos });
    await setTimeout(80);
    if ((await action('observe')).crosshair?.pos?.join(',') !== tree.pos.join(',')) continue;
    const stock = count(await action('get_inventory'), tree.name);
    if (!(await action('break_block', { pos: tree.pos, maxTicks: 100 }))?.broken) continue;
    const drops = await action('get_entities', { type: 'item', radius: 5 });
    for (const item of drops.entities.filter(candidate => candidate.item?.id === tree.name)) {
      await action('go_to', { entityId: item.id, stopDistance: 0.3, maxTicks: 55 });
    }
    await setTimeout(350);
    if (count(await action('get_inventory'), tree.name) > stock) return tree.name;
  }
}

export async function ensurePlanks(action, craft, needed) {
  for (let batch = 0; batch <= Math.ceil(needed / 4); batch++) {
    const { slots } = await action('get_inventory');
    const planks = slots.filter(stack => stack.id.endsWith('_planks')).reduce((total, stack) => total + stack.count, 0);
    if (planks >= needed) return;
    if (batch === Math.ceil(needed / 4)) break;
    const log = slots.find(stack => stack.id.endsWith('_log'))?.id ?? await harvestReachableLog(action);
    assert.ok(log, 'Could not collect a reachable log for more planks');
    await craft(log.replace(/_log$/, '_planks'), 4);
  }
  throw new Error('The crafted planks did not arrive in the inventory');
}

async function prepareCamp(action, craft, table, bed) {
  const checked = new Set();
  const wanted = /:(?:stone|coal_ore|\w+_log)$/;
  let madeFurnace = false;
  for (let job = 0; job < 30; job++) {
    const player = await action('observe');
    if (player.timeOfDay >= CAMP_WORK_END || player.timeOfDay < 0 || player.health < 12) break;
    const inventory = await action('get_inventory');
    const pickaxe = inventory.slots.find(stack => stack.id === PICKAXE);
    if (player.food < 18 && count(inventory, MUTTON) > 1) {
      await hold(action, MUTTON);
      await action('use_item', { ticks: 36 });
      continue;
    }
    if (!madeFurnace && count(inventory, 'minecraft:cobblestone') >= 8
        && (await action('interact_block', { pos: table }))?.screenOpened === 'CraftingScreen') {
      await craft('minecraft:furnace', 1);
      await action('stop', { closeScreen: true });
      madeFurnace = true;
      continue;
    }
    const origin = feet(player);
    const { cells } = await action('get_blocks', { center: origin, size: [9, 7, 9], format: 'json' });
    const nearby = cells.map(({ x, y, z, b }) => ({
      b, pos: [x, y, z],
      reach: Math.hypot(x + 0.5 - player.position.x, y + 0.5 - player.position.y - 1.62, z + 0.5 - player.position.z),
    })).filter(({ b, pos, reach }) => wanted.test(b) && reach <= 4.25 && !checked.has(pos.join(','))
      // The bed head and foot need their supporting blocks at night.
      && (pos[1] >= bed[1] || Math.max(Math.abs(pos[0] - bed[0]), Math.abs(pos[2] - bed[2])) > 2)
      && (b.endsWith('_log') || (pickaxe && pickaxe.maxDamage - (pickaxe.damage ?? 0) > 4 && !madeFurnace)))
      .sort((a, b) => a.reach - b.reach);
    let gathered = false;
    for (const target of nearby.slice(0, 8)) {
      checked.add(target.pos.join(','));
      await action('look', { at: target.pos });
      await setTimeout(70);
      if ((await action('observe')).crosshair?.pos?.join(',') !== target.pos.join(',')) continue;
      if (!target.b.endsWith('_log')) await hold(action, PICKAXE);
      const broken = await action('break_block', { pos: target.pos, maxTicks: 95 });
      if (!broken?.broken) continue;
      const { entities } = await action('get_entities', { type: 'item', radius: 5 });
      for (const item of entities.filter(drop => /:(?:cobblestone|coal|\w+_log)$/.test(drop.item?.id)
          && Math.hypot(drop.pos[0] - bed[0] - 0.5, drop.pos[2] - bed[2] - 0.5) < 3.2
          && Math.abs(drop.pos[1] - bed[1]) <= 1)) {
        await action('go_to', { entityId: item.id, stopDistance: 0.3, maxTicks: 40 });
      }
      gathered = true;
      break;
    }
    if (!gathered && nearby.length <= 8) break;
  }
  await action('go_to', { pos: bed, stopDistance: 1.6, maxTicks: 55 });
}

async function cookAtCamp(action, craft) {
  const player = await action('observe');
  const supplies = await action('get_inventory');
  if (!player?.inWorld || player.timeOfDay >= 10_300 || player.health < 14
      || count(supplies, MUTTON) < 3 || !count(supplies, STONE_PICKAXE) || !count(supplies, FURNACE)
      || !supplies.slots.some(stack => stack.id.endsWith('_log') || (stack.id.endsWith('_planks') && stack.count >= 2))) return;
  if (!supplies.slots.some(stack => stack.id.endsWith('_planks') && stack.count >= 2)) {
    const log = supplies.slots.find(stack => stack.id.endsWith('_log')).id;
    await craft(log.replace(/_log$/, '_planks'), 4);
  }
  const furnace = await placeBeside(action, FURNACE);
  try {
    if ((await action('interact_block', { pos: furnace }))?.screenOpened === 'FurnaceScreen') {
      await cookExpeditionMutton(action);
    }
  } finally {
    await action('stop', { closeScreen: true });
    await hold(action, STONE_PICKAXE);
    assert.ok((await breakVisible(action, furnace))?.broken, 'Could not pack the camp furnace after cooking');
    await action('go_to', { pos: furnace, stopDistance: 0.3, maxTicks: 55 });
  }
}

async function provisionCampBeforeSleep(action, craft, bed) {
  const triedAnimals = new Set();
  for (let job = 0; job < 24; job++) {
    const player = await action('observe');
    if (!player?.onGround || player.timeOfDay >= 10_300 || player.health < 14) break;
    const inventory = await action('get_inventory');
    if (count(inventory, FIELD_GUIDE)) return;
    if (count(inventory, MUTTON) < 5) {
      const { entities } = await action('get_entities', { type: 'sheep', radius: 8, max: 12 });
      const sheep = entities.find(entity => entity.distance <= 6 && !triedAnimals.has(entity.id)
        && Math.hypot(...entity.pos.map((coordinate, axis) => coordinate - bed[axis])) <= 8);
      if (sheep) {
        triedAnimals.add(sheep.id);
        await hunt(action, sheep, item => item === MUTTON);
        continue;
      }
    }
    const timber = inventory.slots.reduce((total, { id, count: amount }) => {
      if (id.endsWith('_log')) return total + amount * 4;
      if (id.endsWith('_planks')) return total + amount;
      return total;
    }, 0);
    if (timber >= 32 || !await harvestReachableLog(action, bed)) break;
  }
  await cookAtCamp(action, craft);
  const visited = [];
  const rejectedSteps = new Set();
  for (let step = 0; step < 24; step++) {
    const player = await action('observe');
    const here = feet(player);
    if (Math.hypot(...here.map((axis, index) => axis - bed[index])) <= 2) return;
    visited.push(here);
    await stepOut(action, player, visited, bed, false, rejectedSteps);
  }
  throw new Error('Could not walk back to the bed after collecting camp supplies');
}

export async function feedAdoptedDog(action, uuid, bed, attempts = 120) {
  const startingStock = await action('get_inventory');
  if (!DOG_FOOD.some(item => count(startingStock, item))) return false;
  const visited = [];
  const rejectedSteps = new Set();
  for (let attempt = 0; attempt < attempts; attempt++) {
    const player = await action('observe');
    const observed = await action('get_entities', { type: DOG, radius: FEEDING_SEARCH_RADIUS });
    const dog = observed?.entities.find(entity => entity.uuid === uuid);
    if (dog?.distance <= 4.4) {
      const inventory = await action('get_inventory');
      const meal = DOG_FOOD.find(item => count(inventory, item));
      if (!meal) return false;
      const mealCount = count(inventory, meal);
      if (inventory.mainHand?.id !== meal) await hold(action, meal);
      if (await visible(action, dog.id)) {
        await action('interact_entity', { entityId: dog.id });
        await setTimeout(350);
        const remaining = count(await action('get_inventory'), meal);
        if (remaining === mealCount - 1) return true;
        assert.equal(remaining, mealCount, 'A single feeding changed the raw meal count unexpectedly');
      }
    }
    if (player && attempt % 2 === 1) {
      const tile = feet(player);
      const fromCamp = Math.hypot(tile[0] - bed[0], tile[1] - bed[1], tile[2] - bed[2]);
      visited.push(tile);
      const nearCamp = dog && Math.hypot(...dog.pos.map((axis, index) => axis - bed[index])) <= FEEDING_SEARCH_RADIUS;
      if (nearCamp && Math.abs(dog.pos[1] - player.position.y) <= 4 && fromCamp < FEEDING_SEARCH_RADIUS) {
        // Track the moving dog on level ground before falling back to dry waypoints.
        if (dog.distance <= 12 && Math.abs(dog.pos[1] - player.position.y) <= 1.25) {
          const approach = await action('go_to', { entityId: dog.id, stopDistance: 2.2, maxTicks: 45 });
          if (approach?.arrived) continue;
        }
        await stepOut(action, player, visited, dog.pos, false, rejectedSteps);
      } else if (fromCamp > 3) {
        await stepOut(action, player, visited, bed, false, rejectedSteps);
      }
    }
    await setTimeout(550);
  }
  return false;
}

async function seekExpeditionFood(action, player, visited, rejectedSteps, tried) {
  const nearby = await action('get_entities', { radius: 24, max: 64 });
  const animal = nearby?.entities.find(entity => (BACKUP_MEAT[entity.type] || entity.type === 'minecraft:sheep')
    && !tried.has(entity.id) && Math.abs(entity.pos[1] - player.position.y) < 3);
  if (animal?.distance <= 6) {
    tried.add(animal.id);
    await hunt(action, animal, item => item === (BACKUP_MEAT[animal.type] ?? MUTTON));
  } else {
    visited.push(feet(player));
    await stepOut(action, player, visited, animal?.pos, 'grass', rejectedSteps);
  }
}

export async function forageExpeditionMeal(action) {
  const visited = [];
  const rejectedSteps = new Set();
  const tried = new Set();
  for (let attempt = 0; attempt < 28; attempt++) {
    const inventory = await action('get_inventory');
    if (DOG_FOOD.some(item => count(inventory, item))) return true;
    const player = await action('observe');
    if (!player?.inWorld || player.dead || player.health < 12) return false;
    await seekExpeditionFood(action, player, visited, rejectedSteps, tried);
  }
  return false;
}

export async function prepareAdoptionCamp(action, craft, descendFromCanopy, { chooseRoute, reportScouting } = {}) {
  const bedding = await gatherWool(action, descendFromCanopy, chooseRoute, craft, reportScouting);
  if (typeof bedding !== 'string') {
    return { bed: bedding.bed, door: bedding.door, entrance: bedding.entrance };
  }
  await ensurePlanks(action, craft, 3);
  // Bring the first table to the flock so sleeping doesn't depend on retracing the route.
  const table = await placeBeside(action, 'minecraft:crafting_table');
  assert.equal((await action('interact_block', { pos: table }))?.screenOpened, 'CraftingScreen');
  const bed = `minecraft:${bedding}_bed`;
  await craft(bed, 1);
  await action('stop', { closeScreen: true });
  const bedPos = await placeBeside(action, bed);
  await prepareCamp(action, craft, table, bedPos);
  return { table, bed: bedPos };
}

export async function adoptAtNight(action, { bed, door, entrance }, craft) {
  if (!door) await provisionCampBeforeSleep(action, craft, bed);
  await action('look', { pitch: 4 });

  for (let attempt = 0; attempt < 180; attempt++) {
    const player = await action('observe');
    if (!player || player.screen === 'InBedChatScreen') {
      // The integrated client can briefly stall while the world advances to morning.
      await setTimeout(500);
      continue;
    }
    assert.ok(player.inWorld && !player.dead && player.health > 4, 'Lost a safe position beside the bed');
    const dogs = await action('get_entities', { type: DOG, radius: FEEDING_SEARCH_RADIUS });
    const pup = dogs?.entities.find(entity => entity.name === 'Mushroom');
    const inventory = pup && !player.screen ? await action('get_inventory') : null;
    if (inventory?.slots.some(stack => stack.id === 'mushroom_yorkie:field_guide')) {
      assert.ok(pup.uuid, 'Rebuild the expedition bridge with companion identity support');
      if (door) {
        // Waking can put the player beside the bed, so only open the door when crossing the threshold.
        const outside = () => action('go_to', { pos: entrance, stopDistance: 0.35, maxTicks: 35 });
        if (!(await outside())?.arrived) {
          assert.ok(await useShelterDoor(action, door) && (await outside())?.arrived,
            'Could not leave the sheltered bed through its door');
        }
      }
      return pup.uuid;
    }
    if (!player.screen && player.timeOfDay >= 12_542 && player.timeOfDay < 23_460) {
      await action('interact_block', { pos: bed, face: 'up' });
    }
    // Let the actual cycle advance. Using the bed is the only action that advances it to morning.
    await setTimeout(player.timeOfDay >= 23_460 || !dogs ? 500 : 4500);
  }
  throw new Error('No native night sleep and adoption within the test window');
}

async function breakVisible(action, pos) {
  await action('look', { at: pos });
  await setTimeout(80);
  if ((await action('observe'))?.crosshair?.pos?.join(',') !== pos.join(',')) return null;
  return action('break_block', { pos, maxTicks: 115 });
}

async function moveAwayFromFire(action, hazards) {
  let player = await action('observe');
  if (!player?.inWorld || player.dead) return;
  const tile = feet(player);
  const nearest = hazards.reduce((best, block) => {
    const distance = Math.hypot(block.x - tile[0], block.y - tile[1], block.z - tile[2]);
    return !best || distance < best.distance ? { ...block, distance } : best;
  }, null);
  const away = nearest && [tile[0] + 7 * Math.sign(tile[0] - nearest.x), tile[1],
    tile[2] + 7 * Math.sign(tile[2] - nearest.z)];
  const destination = away && away.join(',') !== tile.join(',') ? away : undefined;
  const visited = [];
  const rejectedSteps = new Set();
  for (let step = 0; step < 3; step++) {
    const here = feet(player);
    if (Math.hypot(...here.map((axis, index) => axis - tile[index])) >= 6) return;
    visited.push(here);
    await stepOut(action, player, visited, destination, undefined, rejectedSteps);
    player = await action('observe');
    if (!player?.inWorld || player.dead) return;
  }
}

export async function mineVisible(action, bed, alreadyMined, wanted, drops, protectedGround = new Set()) {
  const player = await action('observe');
  assert.ok(player?.inWorld && !player.dead && player.health >= 8, 'The quarry became unsafe for the player');
  const [px, py, pz] = feet(player);
  const volume = await action('get_blocks', { center: [px, py, pz], size: [11, 9, 11], format: 'json' });
  const fire = volume.cells.filter(({ b }) => /:(?:lava|fire|soul_fire)$/.test(b));
  const targets = volume.cells.flatMap(({ x, y, z, b }) => {
    const pos = [x, y, z];
    const key = pos.join(',');
    if (!wanted.has(b) || alreadyMined.has(key) || protectedGround.has(key)
        || (x === px && z === pz && y < py)
        || (y < bed[1] && Math.max(Math.abs(x - bed[0]), Math.abs(z - bed[2])) <= 2)
        || fire.some(pool => Math.abs(pool.y - y) <= 1
          && Math.max(Math.abs(pool.x - x), Math.abs(pool.z - z)) <= 1)) return [];
    const reach = Math.hypot(x + 0.5 - player.position.x, y + 0.5 - player.position.y - 1.62, z + 0.5 - player.position.z);
    return reach <= 4.15 ? [{ pos, reach }] : [];
  }).sort((a, b) => a.reach - b.reach);
  if (!targets.length) return false;
  const sumDrops = stock => [...drops].reduce((total, item) => total + count(stock, item), 0);
  const before = sumDrops(await action('get_inventory'));
  for (const { pos } of targets.slice(0, 12)) {
    const result = await breakVisible(action, pos);
    if (/took damage from (?:lava|.*fire)/i.test(result?.reason ?? '')) {
      await moveAwayFromFire(action, fire);
      return false;
    }
    if (!result?.broken) continue;
    alreadyMined.add(pos.join(','));
    const { entities } = await action('get_entities', { type: 'item', radius: 6 });
    for (const item of entities.filter(entity => drops.has(entity.item?.id))) {
      await action('go_to', { entityId: item.id, stopDistance: 0.35, maxTicks: 35 });
    }
    await setTimeout(125);
    return sumDrops(await action('get_inventory')) > before;
  }
  return false;
}

export async function settleOnDryStep(action, landing, wait = setTimeout) {
  const target = landing.join(',');
  for (let attempt = 0; attempt < 8; attempt++) {
    const player = await action('observe');
    if (!player?.inWorld || player.dead || player.health < 8 || player.inWater) return false;
    if (player.onGround && feet(player).join(',') === target) return true;
    if (attempt === 3 && player.onGround && Math.abs(player.position.y - landing[1] - 1) < 0.05) {
      const dx = landing[0] + 0.5 - player.position.x;
      const dz = landing[2] + 0.5 - player.position.z;
      // The walker's stopping radius can leave part of the player's body
      // supported by the old ledge. Walk into the verified opening.
      if (Math.hypot(dx, dz) <= 0.45) {
        await action('move', { forward: true, yaw: Math.atan2(-dx, dz) * 180 / Math.PI, ticks: 2 });
      }
    }
    await wait(125);
  }
  return false;
}

async function descendQuarry(action, player, bed, stairs, protectedGround) {
  const start = feet(player);
  const { cells } = await action('get_blocks', { center: start, size: [7, 7, 7], format: 'json' });
  const step = quarryStep(cells, start, bed, stairs);
  if (!step) return 'unavailable';
  let opened = false;
  for (const pos of step.clear) {
    const result = await breakVisible(action, pos);
    if (/took damage from (?:lava|.*fire)/i.test(result?.reason ?? '')) {
      await moveAwayFromFire(action, cells.filter(({ b }) => /:(?:lava|fire|soul_fire)$/.test(b)));
      return 'blocked';
    }
    if (!result?.broken) return opened ? 'blocked' : 'unavailable';
    opened = true;
  }
  const outcome = await action('go_to', { pos: step.landing, stopDistance: 0.3, maxTicks: 45 });
  if (!outcome?.arrived || !await settleOnDryStep(action, step.landing)) return 'blocked';
  const [x, y, z] = start;
  const [tx, ty, tz] = step.landing;
  for (const support of [[x, y - 1, z], [tx, ty - 1, tz]]) protectedGround.add(support.join(','));
  stairs.push(start);
  return step.landing;
}

async function climbQuarry(action, pos, chooseEscape) {
  const visited = [];
  const rejectedSteps = new Set();
  for (let attempt = 0; attempt < 8; attempt++) {
    const result = await action('go_to', { pos, stopDistance: 0.3, maxTicks: 35 });
    if (result?.arrived && await settleOnDryStep(action, pos)) return true;
    const player = await action('observe');
    if (!player?.inWorld || player.dead || player.health < 8) return false;
    const here = feet(player);
    const blocked = result?.reason?.match(/blocked by minecraft:\w+_leaves at (-?\d+),(-?\d+),(-?\d+)/);
    const choices = { walk_around: 'Take a different observed dry route toward the next known step.' };
    if (blocked) choices.clear_leaves = 'Break the leaves blocking the view, then try the step again.';
    const ceiling = result?.reason?.match(/blocked by minecraft:(?:stone|andesite|diorite|granite|dirt|deepslate) at (-?\d+),(-?\d+),(-?\d+) \(above head/);
    const headroom = ceiling?.slice(1).map(Number);
    if (headroom && headroom[1] >= here[1] + 2) {
      const neighborhood = await action('get_blocks', { center: headroom, size: [3, 3, 3], format: 'json' });
      if (neighborhood?.cells.every(({ b }) => !/:(?:water|lava|gravel|.*sand)$/.test(b))) {
        choices.clear_headroom = 'Clear the ordinary block overhead to make room to jump up.';
      }
    }
    if (pos[1] === here[1] + 1 && Math.abs(pos[0] - here[0]) + Math.abs(pos[2] - here[2]) === 1) {
      const volume = await action('get_blocks', { center: here, size: [5, 5, 5], format: 'json' });
      const dry = dryWaypoint(volume.cells, here, [], pos);
      if (dry?.join(',') === pos.join(',')) choices.jump_step = 'Jump directly onto the verified dry stair.';
    }
    const fallback = choices.clear_headroom ? 'clear_headroom' : choices.jump_step ? 'jump_step'
      : blocked ? 'clear_leaves' : 'walk_around';
    const choice = chooseEscape ? await chooseEscape(player, {
      attempt: attempt + 1, stepOffset: pos.map((axis, index) => axis - here[index]),
      lastResult: result?.reason ?? 'Player reached the horizontal target but did not land on the step.',
    }, choices, fallback) : fallback;
    if (choice === 'clear_leaves' && blocked) {
      if ((await breakVisible(action, blocked.slice(1).map(Number)))?.broken) continue;
    } else if (choice === 'clear_headroom' && headroom) {
      if ((await breakVisible(action, headroom))?.broken) continue;
    } else if (choice === 'jump_step') {
      const yaw = Math.atan2(player.position.x - pos[0] - 0.5, pos[2] + 0.5 - player.position.z) * 180 / Math.PI;
      await action('move', { yaw, forward: true, jump: true, ticks: 6 });
      if (await settleOnDryStep(action, pos)) return true;
    }
    visited.push(here);
    await stepOut(action, player, visited, pos, false, rejectedSteps);
  }
  return false;
}

async function leaveQuarry(action, stairs, { chooseEscape, waitForCoaching }) {
  const entry = stairs[0];
  for (const pos of [...stairs].reverse()) {
    if (await climbQuarry(action, pos, chooseEscape)) continue;
    const player = await action('observe');
    if (player?.onGround && player.position.y >= entry[1]) return;
    if (await waitForCoaching?.({ reason: 'Quarry exit blocked', target: pos })
      && await climbQuarry(action, pos, chooseEscape)) continue;
    throw new Error('Could not find a safe way back up the quarry stairs');
  }
}

async function reenterQuarry(action, stairs, landing) {
  const entrance = stairs[0];
  const visited = [];
  const rejected = new Set();
  for (let attempt = 0; attempt < 16; attempt++) {
    const player = await action('observe');
    if (!player?.inWorld || player.dead || player.health < 14) return [];
    const here = feet(player);
    if (player.onGround && here.join(',') === entrance.join(',')) break;
    if (Math.hypot(...here.map((n, axis) => n - entrance[axis])) > 45 || attempt === 15) return [];
    visited.push(here);
    await stepOut(action, player, visited, entrance, undefined, rejected);
  }
  const retraced = [];
  for (const [index, tile] of [...stairs.slice(1), landing].entries()) {
    const player = await action('observe');
    if (!player?.onGround || player.health < 14) break;
    const here = feet(player);
    const { cells } = await action('get_blocks', { center: here, size: [5, 7, 5], format: 'json' });
    const step = dryWaypoint(cells, here, [], tile);
    if (step?.join(',') !== tile.join(',')) break;
    const walked = await action('go_to', { pos: tile, stopDistance: 0.3, maxTicks: 45 });
    if (!walked?.arrived || !await settleOnDryStep(action, tile)) break;
    retraced.push(stairs[index]);
  }
  return retraced;
}

async function openCampTable(action, table, visited) {
  const rejectedSteps = new Set();
  for (let attempt = 0; attempt < 24; attempt++) {
    const player = await action('observe');
    if (Math.hypot(player.position.x - table[0] - 0.5, player.position.y - table[1],
      player.position.z - table[2] - 0.5) < 3.6
      && (await action('interact_block', { pos: table }))?.screenOpened === 'CraftingScreen') return;
    visited.push(feet(player));
    await stepOut(action, player, visited, table, false, rejectedSteps);
  }
  throw new Error('Could not walk back to the crafting table after quarrying');
}

async function takeCover(action) {
  const player = await action('observe');
  if (!player?.inWorld || player.dead || player.timeOfDay < 12_000 || player.timeOfDay >= 23_500) return false;
  const center = feet(player);
  const area = await action('get_blocks', { center, size: [19, 9, 19], format: 'json' });
  const cover = nearestCover(area.cells, center);
  if (!cover) return false;
  const visited = [];
  const rejected = new Set();
  for (let attempt = 0; attempt < 8; attempt++) {
    const position = await action('observe');
    if (!position?.inWorld || position.dead) return false;
    const tile = feet(position);
    if (tile.join(',') === cover.join(',')) return true;
    visited.push(tile);
    await stepOut(action, position, visited, cover, undefined, rejected);
  }
  return false;
}

export async function sleepNearby(action, player) {
  if (!isBedtime(player)) return false;
  const center = feet(player);
  const area = await action('get_blocks', { center, size: [23, 7, 23], format: 'json' });
  const beds = area.cells.filter(({ b }) => b.startsWith('minecraft:') && b.endsWith('_bed'))
    .map(({ x, y, z }) => [x, y, z]);
  const distance = (from, to) => Math.hypot(...from.map((value, index) => value - to[index]));
  const bed = beds.filter(pos => distance(center, pos) <= 10)
    .sort((first, second) => distance(center, first) - distance(center, second))[0];
  if (!bed) return false;
  const visited = [];
  const rejected = new Set();
  for (let approach = 0; approach < 6; approach++) {
    const current = await action('observe');
    if (!current?.inWorld || current.dead || !isBedtime(current)) return false;
    const here = feet(current);
    if (distance(here, bed) <= 3) {
      const response = await action('interact_block', { pos: bed, face: 'up' });
      if (response?.screenOpened !== 'InBedChatScreen') return false;
      for (let check = 0; check < 24; check++) {
        await setTimeout(500);
        const woke = await action('observe');
        if (woke?.inWorld && !woke.screen && woke.timeOfDay <= 1_200) return true;
      }
      return false;
    }
    visited.push(here);
    await stepOut(action, current, visited, bed, undefined, rejected);
  }
  return false;
}

export async function recoverDroppedLoadout(action, destination) {
  const visited = [];
  const rejectedSteps = new Set();
  let stalled = 0;
  let detours = 0;
  for (let attempt = 0; attempt < 100; attempt++) {
    const player = await action('observe');
    assert.ok(player?.inWorld && !player.dead && player.health >= 10, 'The return to the dropped gear became unsafe');
    if (attempt === 0 && await sleepNearby(action, player)) continue;
    const here = feet(player);
    if (Math.hypot(...destination.map((coordinate, axis) => coordinate - here[axis])) <= 5) {
      const { entities } = await action('get_entities', { type: 'item', radius: 8 });
      // Walk to the guide first so the next controller can recognize the returning owner.
      const guide = entities.find(entity => entity.item?.id === FIELD_GUIDE);
      for (const drop of [guide, ...entities.filter(entity => entity !== guide)].filter(Boolean)) {
        if (Math.abs(drop.pos[1] - player.position.y) > 1.5) continue;
        await action('go_to', { entityId: drop.id, stopDistance: 0.25, maxTicks: 40 });
      }
      if (count(await action('get_inventory'), FIELD_GUIDE)) return;
    }
    visited.push(here);
    const recent = new Set(visited.slice(-16).map(([x, , z]) => `${x},${z}`));
    if (visited.length >= 16 && recent.size <= 4) {
      if (++detours > 2) break;
      await stepOut(action, player, visited, undefined, undefined, rejectedSteps);
      visited.splice(0, visited.length - 4);
      continue;
    }
    stalled = await stepOut(action, player, visited, destination, false, rejectedSteps) ? 0 : stalled + 1;
    if (stalled >= 3) break;
  }
  await takeCover(action);
  throw new Error('Could not recover the original guide from the place where the player died');
}

export async function earnStoneKit(action, craft, { table, bed },
    { beforeNight = false, chooseWork, chooseEscape, waitForCoaching } = {}) {
  const initial = await action('get_inventory');
  if (count(initial, STONE_PICKAXE) && count(initial, FURNACE)) return;
  const visited = [];
  const rejectedSteps = new Set();
  const mined = new Set();
  const ore = new Set(['minecraft:stone']);
  const drops = new Set([COBBLESTONE]);
  const stairs = [];
  const protectedGround = new Set();
  let missedStone = 0;
  let abandonedQuarries = 0;
  let nextSleepCheck = 0;
  for (let attempt = 0; attempt < 70; attempt++) {
    const inventory = await action('get_inventory');
    const needed = count(inventory, FURNACE) ? 3 : 11;
    if (count(inventory, COBBLESTONE) >= needed) break;
    const player = await action('observe');
    if (beforeNight && (player.timeOfDay >= 11_000 || player.health < 14)) break;
    if (!beforeNight && !stairs.length && isBedtime(player) && player.gameTime >= nextSleepCheck) {
      nextSleepCheck = player.gameTime + 300;
      if (await sleepNearby(action, player)) continue;
    }
    if (!inventory.slots.some(stack => stack.id === PICKAXE && durability(stack) > 5)) {
      const needsSticks = count(inventory, 'minecraft:stick') < 2;
      await ensurePlanks(action, craft, needsSticks ? 9 : 7);
      if (needsSticks) await craft('minecraft:stick', 4);
      await craft('minecraft:crafting_table', 1);
      const toolTable = await placeBeside(action, 'minecraft:crafting_table');
      await openCampTable(action, toolTable, visited);
      await craft(PICKAXE, 1);
      await action('stop', { closeScreen: true });
      await hold(action, PICKAXE);
      continue;
    }
    if (inventory.mainHand?.id !== PICKAXE || durability(inventory.mainHand) <= 5) await hold(action, PICKAXE);
    if (await mineVisible(action, bed, mined, ore, drops, protectedGround)) {
      missedStone = 0;
      continue;
    }
    missedStone++;
    const normalWork = missedStone >= 8 ? 'quarry' : 'scout';
    const work = chooseWork && !stairs.length && missedStone >= 4
      ? await chooseWork(player, { beforeNight, missedStone, cobblestone: count(inventory, COBBLESTONE), needed }, normalWork)
      : normalWork;
    if (work === 'camp') break;
    if (stairs.length || work === 'quarry') {
      const descent = stairs.length < 7
        ? await descendQuarry(action, player, bed, stairs, protectedGround)
        : 'unavailable';
      if (Array.isArray(descent)) continue;
      if (descent === 'blocked' || stairs.length) {
        await leaveQuarry(action, stairs, { chooseEscape, waitForCoaching });
        stairs.length = 0;
        missedStone = 0;
        if (++abandonedQuarries >= 3) break;
      }
    }
    const scout = await action('observe');
    const position = feet(scout);
    const distance = Math.hypot(position[0] - table[0], position[2] - table[2]);
    visited.push(position);
    const returnToCamp = distance > (beforeNight ? 9 : 40);
    await stepOut(action, scout, visited, returnToCamp ? table : undefined, 'stone', rejectedSteps);
  }
  await leaveQuarry(action, stairs, { chooseEscape, waitForCoaching });
  const materials = await action('get_inventory');
  const furnace = count(materials, FURNACE);
  if (count(materials, COBBLESTONE) < (furnace ? 3 : 11)) {
    if (!beforeNight) throw new Error('Could not earn enough cobblestone for a pickaxe and furnace');
    const campSteps = [];
    const campRejections = new Set();
    for (let attempt = 0; attempt < 12; attempt++) {
      const player = await action('observe');
      const at = feet(player);
      if (Math.hypot(at[0] - bed[0], at[1] - bed[1], at[2] - bed[2]) <= 3) break;
      campSteps.push(at);
      await stepOut(action, player, campSteps, bed, false, campRejections);
    }
    return;
  }
  if (count(await action('get_inventory'), 'minecraft:stick') < 2) {
    await ensurePlanks(action, craft, 2);
    await craft('minecraft:stick', 4);
  }
  await openCampTable(action, table, visited);
  await craft(STONE_PICKAXE, 1);
  if (!furnace) await craft(FURNACE, 1);
  await action('stop', { closeScreen: true });
  if (beforeNight) await action('go_to', { pos: bed, stopDistance: 1.6, maxTicks: 55 });
}

export async function earnIronKit(action, craft, { bed }, policy = {}) {
  const stairs = [];
  const protectedGround = new Set();
  if (policy.resumeQuarry?.length) {
    const player = await action('observe');
    const landing = policy.resumeQuarryLanding;
    if (landing && player?.onGround && player.health >= 14 && feet(player).join(',') === landing.join(',')) {
      stairs.push(...policy.resumeQuarry);
      for (const [x, y, z] of [...stairs, landing]) protectedGround.add(`${x},${y - 1},${z}`);
    } else if (policy.reenterQuarry && landing) {
      stairs.push(...await reenterQuarry(action, policy.resumeQuarry, landing));
      const arrived = stairs.length ? feet(await action('observe')) : undefined;
      if (arrived) {
        for (const [x, y, z] of [...stairs, arrived]) protectedGround.add(`${x},${y - 1},${z}`);
      }
      await policy.saveQuarry?.(stairs, arrived);
    } else {
      await leaveQuarry(action, policy.resumeQuarry, policy);
      await policy.saveQuarry?.([]);
    }
  }
  const startingStock = await action('get_inventory');
  const recipes = IRON_RECIPES.filter(([item]) => !count(startingStock, item));
  const needsIgnitionIngot = policy.reserveIgnitionIron && !count(startingStock, 'minecraft:flint_and_steel')
    && !count(startingStock, 'minecraft:fire_charge');
  const wantedIngots = recipes.reduce((amount, [, cost]) => amount + cost, Number(Boolean(needsIgnitionIngot)));
  const requiredOre = Math.max(0, wantedIngots - count(startingStock, IRON_INGOT));
  if (!recipes.length && !requiredOre) {
    await leaveQuarry(action, stairs, policy);
    if (stairs.length) await policy.saveQuarry?.([]);
    return;
  }
  const visited = [];
  const rejectedSteps = new Set();
  const mined = new Set();
  const drops = new Set([RAW_IRON, COAL]);
  let misses = 0;
  let quarries = 0;
  let madeBackup = false;
  let nextSleepCheck = 0;
  let nextCoverCheck = 0;
  const triedFoodSources = new Set();
  for (let attempt = 0; attempt < 190; attempt++) {
    const inventory = await action('get_inventory');
    const wanted = new Set();
    if (count(inventory, RAW_IRON) < requiredOre) {
      wanted.add('minecraft:iron_ore');
      wanted.add('minecraft:deepslate_iron_ore');
    }
    if (wanted.size && !count(inventory, COAL) && !count(inventory, CHARCOAL)) wanted.add('minecraft:coal_ore');
    if (!wanted.size) break;
    const picks = inventory.slots.filter(stack => stack.id === STONE_PICKAXE);
    const usable = picks.some(pick => durability(pick) > 8);
    if (usable && (inventory.mainHand?.id !== STONE_PICKAXE || durability(inventory.mainHand) <= 8)) {
      await hold(action, STONE_PICKAXE);
    }
    const player = await action('observe');
    if (!stairs.length && isBedtime(player) && player.gameTime >= nextSleepCheck) {
      nextSleepCheck = player.gameTime + 300;
      if (await sleepNearby(action, player)) continue;
    }
    if (!stairs.length && player.health < 8 && isBedtime(player) && player.gameTime >= nextCoverCheck) {
      nextCoverCheck = player.gameTime + 300;
      if (await takeCover(action)) {
        for (let watch = 0; watch < 24; watch++) {
          await setTimeout(500);
          const resting = await action('observe');
          if (!resting?.inWorld || resting.dead || !isBedtime(resting) || resting.health >= 8
              || resting.threats?.some(threat => threat.distance < 5)) break;
        }
        continue;
      }
    }
    const meal = [...COOKED_FOOD, ...BACKUP_FOOD].find(item => count(inventory, item))
      ?? (count(inventory, MUTTON) > (player.health < 14 || player.food <= 12 ? 0 : 1) ? MUTTON : undefined);
    if (player.food < 20 && (player.food <= 16 || player.health < 14) && meal) {
      await hold(action, meal);
      await action('use_item', { ticks: 36 });
      continue;
    }
    if (!meal && (player.food <= 16 || (player.food < 18 && player.health < 14))) {
      if (stairs.length) {
        await leaveQuarry(action, stairs, policy);
        stairs.length = 0;
        await policy.saveQuarry?.([]);
        continue;
      }
      await seekExpeditionFood(action, player, visited, rejectedSteps, triedFoodSources);
      continue;
    }
    if (usable && await mineVisible(action, bed, mined, wanted, drops, protectedGround)) {
      misses = 0;
      continue;
    }
    misses++;
    const needsTool = !usable || (!madeBackup && picks.length < 2 && picks.every(pick => durability(pick) < 90));
    if (!stairs.length && needsTool && (misses >= 8 || !usable) && count(inventory, COBBLESTONE) >= 3) {
      await ensurePlanks(action, craft, 6);
      await craft('minecraft:crafting_table', 1);
      if (count(await action('get_inventory'), 'minecraft:stick') < 2) await craft('minecraft:stick', 4);
      const toolTable = await placeBeside(action, 'minecraft:crafting_table');
      await openCampTable(action, toolTable, visited);
      await craft(STONE_PICKAXE, 1);
      await action('stop', { closeScreen: true });
      await hold(action, STONE_PICKAXE);
      madeBackup = true;
      continue;
    }
    const fallback = misses >= 15 ? 'quarry' : 'scout';
    const work = policy.chooseWork && misses >= 8 && !stairs.length
      ? await policy.chooseWork(player, { material: 'iron', missedStone: misses,
        rawIron: count(inventory, RAW_IRON), needed: requiredOre, hasCoal: count(inventory, COAL) > 0 }, fallback)
      : fallback;
    let openedBlockedQuarry = false;
    if (usable && stairs.length < 44 && player.position.y > 20 && (stairs.length || work === 'quarry')) {
      const descent = await descendQuarry(action, player, bed, stairs, protectedGround);
      if (Array.isArray(descent)) {
        await policy.saveQuarry?.(stairs, descent);
        continue;
      }
      openedBlockedQuarry = descent === 'blocked';
    }
    if (stairs.length || openedBlockedQuarry) {
      await leaveQuarry(action, stairs, policy);
      stairs.length = 0;
      await policy.saveQuarry?.([]);
      quarries++;
      if (quarries >= 3) break;
      misses = 0;
    }
    const scout = await action('observe');
    visited.push(feet(scout));
    await stepOut(action, scout, visited, undefined, 'stone', rejectedSteps);
  }
  await leaveQuarry(action, stairs, policy);
  await policy.saveQuarry?.([]);
  const materials = await action('get_inventory');
  assert.ok(count(materials, RAW_IRON) >= requiredOre, 'Could not earn enough reachable iron ore for the expedition kit');
  const fuel = count(materials, COAL) ? COAL : CHARCOAL;
  const needsCharcoal = requiredOre > 0 && !count(materials, fuel);
  const tablePlanks = recipes.some(([item]) => item === 'minecraft:shield') ? 10 : recipes.length ? 4 : 0;
  const planks = tablePlanks + Number(needsCharcoal);
  await ensurePlanks(action, craft, planks);
  if (recipes.some(([item]) => item === 'minecraft:iron_pickaxe')
      && count(await action('get_inventory'), 'minecraft:stick') < 2) {
    await ensurePlanks(action, craft, planks + 2);
    await craft('minecraft:stick', 4);
  }
  if (needsCharcoal && !(await action('get_inventory')).slots.some(stack => stack.id.endsWith('_log'))) {
    assert.ok(await harvestReachableLog(action), 'Could not collect a reachable log for charcoal');
  }
  if (requiredOre) {
    const furnace = await placeBeside(action, FURNACE);
    await action('interact_block', { pos: furnace });
    if (needsCharcoal) await makeExpeditionCharcoal(action);
    await smeltExpeditionIron(action, requiredOre, fuel);
    await action('stop', { closeScreen: true });
  }
  if (!recipes.length) return;
  await craft('minecraft:crafting_table', 1);
  const table = await placeBeside(action, 'minecraft:crafting_table');
  await openCampTable(action, table, visited);
  for (const [item] of recipes) {
    await craft(item, 1);
  }
  await action('stop', { closeScreen: true });
}
