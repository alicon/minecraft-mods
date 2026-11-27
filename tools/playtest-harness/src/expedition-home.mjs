import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import {
  bedSpotsWithGroundCover, dryStepKey, dryWaypoint, hasPlacedBed, leavesBlockingExit, nearbyBuildingSpots, quarryStep,
} from './expedition-navigation.mjs';
import { cookExpeditionMutton, makeExpeditionCharcoal, smeltExpeditionIron } from './expedition-furnace.mjs';

export const WOOD_LOGS = ['oak', 'birch', 'spruce', 'acacia', 'dark_oak', 'jungle', 'cherry', 'pale_oak', 'mangrove']
  .map(wood => `${wood}_log`);
const WOOL = /^minecraft:(.+)_wool$/;
const MUTTON = 'minecraft:mutton';
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

function count({ slots }, item) {
  return slots.reduce((total, stack) => total + (stack.id === item ? stack.count : 0), 0);
}

function woolColor(inventory) {
  const colors = new Set(inventory.slots.map(({ id }) => WOOL.exec(id)?.[1]).filter(Boolean));
  return [...colors].find(color => count(inventory, `minecraft:${color}_wool`) >= 3);
}

async function hold(action, item) {
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

async function visible(action, entityId) {
  if (!await action('look', { entityId })) return false;
  await setTimeout(110);
  return (await action('observe'))?.crosshair?.id === entityId;
}

async function hunt(action, animal, dropMatches) {
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

async function stepOut(action, player, visited, destination, preferredGround, rejectedSteps = new Set(), chooseRoute) {
  const center = feet(player);
  const width = preferredGround || chooseRoute ? 23 : 17;
  const volume = await action('get_blocks', { center, size: [width, 9, width], format: 'json' });
  let pos = dryWaypoint(volume.cells, center, visited, destination, preferredGround, rejectedSteps);
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
      route = dryWaypoint(volume.cells, center, visited, destination, preferredGround, exits);
    }
    pos = (await chooseRoute(player, routes, destination)).pos;
  }
  const result = await action('go_to', { pos, stopDistance: 0.3, maxTicks: 90 });
  const moved = result?.arrived || Math.hypot(result?.position?.[0] - player.position.x,
    result?.position?.[2] - player.position.z) >= 0.6;
  if (!moved && result?.reason) rejectedSteps.add(dryStepKey(center, pos));
  return moved;
}

async function gatherWool(action, descendFromCanopy, chooseRoute) {
  const visited = [];
  const rejectedSteps = new Set();
  const triedAnimals = new Map();
  let stalls = 0;
  // The first flock can come into range after several minutes of safe scouting.
  for (let round = 0; round < 400; round++) {
    const inventory = await action('get_inventory');
    const color = woolColor(inventory);
    if (color && count(inventory, MUTTON) > 0) return color;

    const player = await action('observe');
    assert.ok(player?.inWorld && !player.dead && player.health > 4, 'Sheep search ran out of safe health');
    const meal = count(inventory, MUTTON) > 1 ? MUTTON : BACKUP_FOOD.find(item => count(inventory, item) > 0);
    if (player.food <= 16 && meal) {
      await hold(action, meal);
      await action('use_item', { ticks: 36 });
    }
    const nearby = await action('get_entities', { type: 'sheep', radius: 96, max: 16 });
    const sheep = nearby.entities.find(entity => (triedAnimals.get(entity.id) ?? -10) < round - 3
      && Math.abs(entity.pos[1] - player.position.y) <= 8);
    if (sheep?.distance <= 6) {
      triedAnimals.set(sheep.id, round);
      if (await hunt(action, sheep, item => WOOL.test(item) || item === MUTTON)) continue;
    }
    if (!meal && player.food <= 15) {
      const { entities } = await action('get_entities', { radius: 6, max: 24 });
      const animal = entities.find(entity => BACKUP_MEAT[entity.type]
        && (triedAnimals.get(entity.id) ?? -10) < round - 3);
      if (animal) {
        triedAnimals.set(animal.id, round);
        if (await hunt(action, animal, item => item === BACKUP_MEAT[animal.type])) continue;
      }
    }
    const here = await action('observe');
    visited.push(feet(here));
    if (await stepOut(action, here, visited, sheep?.pos, sheep ? undefined : 'grass', rejectedSteps, chooseRoute)
        || await descendFromCanopy(here)) {
      stalls = 0;
    } else {
      stalls++;
      assert.ok(stalls < 5, 'Could not find a dry way out while looking for sheep');
    }
  }
  throw new Error('Sheep search ended before earning three matching wool blocks and food');
}

async function placeBeside(action, item) {
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

async function harvestReachableLog(action) {
  const { position } = await action('observe');
  const wood = await action('scan_blocks', { blocks: WOOD_LOGS, radius: 12, max: 40 });
  const candidates = wood.matches.flatMap(({ name, positions }) => positions.map(pos => ({ name, pos })))
    .filter(({ pos }) => Math.abs(pos[1] - position.y) < 2.5)
    .sort((a, b) => Math.hypot(a.pos[0] - position.x, a.pos[2] - position.z)
      - Math.hypot(b.pos[0] - position.x, b.pos[2] - position.z));
  for (const tree of candidates.slice(0, 8)) {
    const approached = await action('go_to', { pos: tree.pos, stopDistance: 2.1, maxTicks: 65 });
    if (!approached?.arrived) continue;
    await action('look', { at: tree.pos });
    await setTimeout(80);
    if ((await action('observe')).crosshair?.pos?.join(',') !== tree.pos.join(',')) continue;
    if (!(await action('break_block', { pos: tree.pos, maxTicks: 100 }))?.broken) continue;
    const drops = await action('get_entities', { type: 'item', radius: 5 });
    for (const item of drops.entities.filter(candidate => candidate.item?.id === tree.name)) {
      await action('go_to', { entityId: item.id, stopDistance: 0.3, maxTicks: 55 });
    }
    await setTimeout(350);
    if (count(await action('get_inventory'), tree.name) > 0) return tree.name;
  }
  throw new Error('Could not collect a reachable log for more planks');
}

async function ensurePlanks(action, craft, needed) {
  for (let batch = 0; batch <= Math.ceil(needed / 4); batch++) {
    const { slots } = await action('get_inventory');
    const planks = slots.filter(stack => stack.id.endsWith('_planks')).reduce((total, stack) => total + stack.count, 0);
    if (planks >= needed) return;
    if (batch === Math.ceil(needed / 4)) break;
    const log = slots.find(stack => stack.id.endsWith('_log'))?.id ?? await harvestReachableLog(action);
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
    assert.ok(await breakVisible(action, furnace), 'Could not pack the camp furnace after cooking');
    await action('go_to', { pos: furnace, stopDistance: 0.3, maxTicks: 55 });
  }
}

async function feedAdoptedDog(action, id, bed) {
  const visited = [];
  const rejectedSteps = new Set();
  for (let attempt = 0; attempt < 120; attempt++) {
    const player = await action('observe');
    const observed = await action('get_entities', { type: DOG, radius: 16 });
    const dog = observed?.entities.find(entity => entity.id === id);
    if (dog?.distance <= 4.4) {
      const inventory = await action('get_inventory');
      const mealCount = count(inventory, MUTTON);
      assert.ok(mealCount > 0, 'No meal is available for the adopted dog');
      if (inventory.mainHand?.id !== MUTTON) await hold(action, MUTTON);
      if (await visible(action, id)) {
        await action('interact_entity', { entityId: id });
        await setTimeout(350);
        const remaining = count(await action('get_inventory'), MUTTON);
        if (remaining === mealCount - 1) return;
        assert.equal(remaining, mealCount, 'A single feeding changed the raw meal count unexpectedly');
      }
    }
    if (player && attempt % 4 === 3) {
      const tile = feet(player);
      const fromCamp = Math.hypot(tile[0] - bed[0], tile[1] - bed[1], tile[2] - bed[2]);
      visited.push(tile);
      // Give a dog below a steep bank time to come back through a safe route.
      if (dog?.distance <= 8 && Math.abs(dog.pos[1] - player.position.y) <= 2 && fromCamp < 6) {
        await stepOut(action, player, visited, dog.pos, false, rejectedSteps);
      } else if (fromCamp > 3) {
        await stepOut(action, player, visited, bed, false, rejectedSteps);
      }
    }
    await setTimeout(550);
  }
  throw new Error('Could not feed the adopted dog after checking reach and the native crosshair');
}

export async function prepareAdoptionCamp(action, craft, descendFromCanopy,
    { prepareStone = false, chooseRoute, ...policy } = {}) {
  const color = await gatherWool(action, descendFromCanopy, chooseRoute);
  await ensurePlanks(action, craft, 3);
  // Bring the first table to the flock so sleeping doesn't depend on retracing the route.
  const table = await placeBeside(action, 'minecraft:crafting_table');
  assert.equal((await action('interact_block', { pos: table }))?.screenOpened, 'CraftingScreen');
  const bed = `minecraft:${color}_bed`;
  await craft(bed, 1);
  await action('stop', { closeScreen: true });
  const bedPos = await placeBeside(action, bed);
  await prepareCamp(action, craft, table, bedPos);
  if (prepareStone) await earnStoneKit(action, craft, { table, bed: bedPos }, { ...policy, beforeNight: true });
  await cookAtCamp(action, craft);
  return { table, bed: bedPos };
}

export async function adoptAtNight(action, { bed }) {
  await action('look', { pitch: 4 });
  await hold(action, MUTTON);

  for (let attempt = 0; attempt < 180; attempt++) {
    const player = await action('observe');
    if (!player || player.screen === 'InBedChatScreen') {
      // The integrated client can briefly stall while the world advances to morning.
      await setTimeout(500);
      continue;
    }
    assert.ok(player.inWorld && !player.dead && player.health > 4, 'Lost a safe position beside the bed');
    const dogs = await action('get_entities', { type: DOG, radius: 8 });
    const pup = dogs?.entities.find(entity => entity.name === 'Mushroom');
    const inventory = pup && !player.screen ? await action('get_inventory') : null;
    if (inventory?.slots.some(stack => stack.id === 'mushroom_yorkie:field_guide')) {
      await feedAdoptedDog(action, pup.id, bed);
      return;
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
  if ((await action('observe'))?.crosshair?.pos?.join(',') !== pos.join(',')) return false;
  return (await action('break_block', { pos, maxTicks: 115 }))?.broken === true;
}

async function mineVisible(action, bed, alreadyMined, wanted, drops, protectedGround = new Set()) {
  const player = await action('observe');
  assert.ok(player?.inWorld && !player.dead && player.health >= 8, 'The quarry became unsafe for the player');
  const [px, py, pz] = feet(player);
  const volume = await action('get_blocks', { center: [px, py, pz], size: [11, 9, 11], format: 'json' });
  const targets = volume.cells.flatMap(({ x, y, z, b }) => {
    const pos = [x, y, z];
    const key = pos.join(',');
    if (!wanted.has(b) || alreadyMined.has(key) || protectedGround.has(key)
        || (x === px && z === pz && y < py)
        || (y < bed[1] && Math.max(Math.abs(x - bed[0]), Math.abs(z - bed[2])) <= 2)) return [];
    const reach = Math.hypot(x + 0.5 - player.position.x, y + 0.5 - player.position.y - 1.62, z + 0.5 - player.position.z);
    return reach <= 4.15 ? [{ pos, reach }] : [];
  }).sort((a, b) => a.reach - b.reach);
  for (const { pos } of targets.slice(0, 12)) {
    if (!await breakVisible(action, pos)) continue;
    alreadyMined.add(pos.join(','));
    const { entities } = await action('get_entities', { type: 'item', radius: 6 });
    for (const item of entities.filter(entity => drops.has(entity.item?.id))) {
      await action('go_to', { entityId: item.id, stopDistance: 0.35, maxTicks: 35 });
    }
    return true;
  }
  return false;
}

export async function settleQuarryStep(action, landing, wait = setTimeout) {
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
    if (!await breakVisible(action, pos)) return opened ? 'blocked' : 'unavailable';
    opened = true;
  }
  const outcome = await action('go_to', { pos: step.landing, stopDistance: 0.3, maxTicks: 45 });
  if (!outcome?.arrived || !await settleQuarryStep(action, step.landing)) return 'blocked';
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
    if (result?.arrived && await settleQuarryStep(action, pos)) return true;
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
      if (await breakVisible(action, blocked.slice(1).map(Number))) continue;
    } else if (choice === 'clear_headroom' && headroom) {
      if (await breakVisible(action, headroom)) continue;
    } else if (choice === 'jump_step') {
      const yaw = Math.atan2(player.position.x - pos[0] - 0.5, pos[2] + 0.5 - player.position.z) * 180 / Math.PI;
      await action('move', { yaw, forward: true, jump: true, ticks: 6 });
      if (await settleQuarryStep(action, pos)) return true;
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
    if (!walked?.arrived || !await settleQuarryStep(action, tile)) break;
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

export async function earnStoneKit(action, craft, { table, bed },
    { beforeNight = false, chooseWork, chooseEscape, waitForCoaching } = {}) {
  const initial = await action('get_inventory');
  if (count(initial, STONE_PICKAXE) && count(initial, FURNACE)) return;
  await hold(action, PICKAXE);
  const visited = [];
  const rejectedSteps = new Set();
  const mined = new Set();
  const ore = new Set(['minecraft:stone']);
  const drops = new Set([COBBLESTONE]);
  const stairs = [];
  const protectedGround = new Set();
  let missedStone = 0;
  for (let attempt = 0; attempt < 70; attempt++) {
    const inventory = await action('get_inventory');
    const needed = count(inventory, FURNACE) ? 3 : 11;
    if (count(inventory, COBBLESTONE) >= needed) break;
    const player = await action('observe');
    if (beforeNight && (player.timeOfDay >= 11_000 || player.health < 14)) break;
    if (await mineVisible(action, bed, mined, ore, drops, protectedGround)) {
      missedStone = 0;
      continue;
    }
    missedStone++;
    const normalWork = missedStone >= 8 ? 'quarry' : 'scout';
    const work = chooseWork && !stairs.length && missedStone >= 4
      ? await chooseWork(player, { beforeNight, missedStone, cobblestone: count(inventory, COBBLESTONE), needed }, normalWork)
      : normalWork;
    if (work === 'camp' || stairs.length >= 7) break;
    if (stairs.length || work === 'quarry') {
      const descent = await descendQuarry(action, player, bed, stairs, protectedGround);
      if (Array.isArray(descent)) continue;
      if (descent === 'blocked' || stairs.length) break;
    }
    const position = feet(player);
    const distance = Math.hypot(position[0] - table[0], position[2] - table[2]);
    visited.push(position);
    const returnToCamp = distance > (beforeNight ? 9 : 40);
    await stepOut(action, player, visited, returnToCamp ? table : undefined, false, rejectedSteps);
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
  if (!recipes.length) {
    await leaveQuarry(action, stairs, policy);
    if (stairs.length) await policy.saveQuarry?.([]);
    return;
  }
  const wantedIngots = recipes.reduce((amount, [, cost]) => amount + cost, 0);
  const requiredOre = Math.max(0, wantedIngots - count(startingStock, IRON_INGOT));
  const visited = [];
  const rejectedSteps = new Set();
  const mined = new Set();
  const drops = new Set([RAW_IRON, COAL]);
  let misses = 0;
  let quarries = 0;
  let madeBackup = false;
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
    const meal = count(inventory, 'minecraft:cooked_mutton') ? 'minecraft:cooked_mutton'
      : count(inventory, MUTTON) > 1 ? MUTTON : undefined;
    if (player.food <= 16 && meal) {
      await hold(action, meal);
      await action('use_item', { ticks: 36 });
      if (usable) await hold(action, STONE_PICKAXE);
    }
    if (usable && await mineVisible(action, bed, mined, wanted, drops, protectedGround)) {
      misses = 0;
      continue;
    }
    misses++;
    if (!stairs.length && !madeBackup && misses >= 8 && picks.length < 2 && count(inventory, COBBLESTONE) >= 3
        && picks.every(pick => durability(pick) < 90)) {
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
  const planks = (recipes.some(([item]) => item === 'minecraft:shield') ? 10 : 4) + Number(needsCharcoal);
  await ensurePlanks(action, craft, planks);
  if (recipes.some(([item]) => item === 'minecraft:iron_pickaxe')
      && count(await action('get_inventory'), 'minecraft:stick') < 2) {
    await ensurePlanks(action, craft, planks + 2);
    await craft('minecraft:stick', 4);
  }
  if (needsCharcoal && !(await action('get_inventory')).slots.some(stack => stack.id.endsWith('_log'))) {
    await harvestReachableLog(action);
  }
  await craft('minecraft:crafting_table', 1);
  const table = await placeBeside(action, 'minecraft:crafting_table');
  if (requiredOre) {
    const furnace = await placeBeside(action, FURNACE);
    await action('interact_block', { pos: furnace });
    if (needsCharcoal) await makeExpeditionCharcoal(action);
    await smeltExpeditionIron(action, requiredOre, fuel);
    await action('stop', { closeScreen: true });
  }
  await openCampTable(action, table, visited);
  for (const [item] of recipes) {
    await craft(item, 1);
  }
  await action('stop', { closeScreen: true });
}
