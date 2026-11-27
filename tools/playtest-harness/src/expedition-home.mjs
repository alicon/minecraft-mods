import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import {
  bedSpotsWithGroundCover, dryStepKey, dryWaypoint, hasPlacedBed, leavesBlockingExit, nearbyBuildingSpots, quarryStep,
} from './expedition-navigation.mjs';
import { smeltExpeditionIron } from './expedition-furnace.mjs';

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
const COAL = 'minecraft:coal';
const IRON_NEEDED = 7;
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
  const stack = inventory.slots.find(entry => entry.id === item);
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

async function stepOut(action, player, visited, destination, seekPasture = false, rejectedSteps = new Set()) {
  const center = feet(player);
  const volume = await action('get_blocks', { center, size: [17, 9, 17], format: 'json' });
  const pos = dryWaypoint(volume.cells, center, visited, destination, seekPasture, rejectedSteps);
  const repeated = visited.filter(tile => tile.every((coordinate, axis) => coordinate === center[axis])).length > 2;
  if (!pos || repeated) {
    const leaf = leavesBlockingExit(volume.cells, center);
    if (leaf && (await action('break_block', { pos: leaf, maxTicks: 30 }))?.broken) return true;
    if (!pos) return false;
  }
  const result = await action('go_to', { pos, stopDistance: 0.3, maxTicks: 90 });
  const moved = result?.arrived || Math.hypot(result?.position?.[0] - player.position.x,
    result?.position?.[2] - player.position.z) >= 0.6;
  if (!moved && result?.reason) rejectedSteps.add(dryStepKey(center, pos));
  return moved;
}

async function gatherWool(action, descendFromCanopy) {
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
    if (await stepOut(action, here, visited, sheep?.pos, !sheep, rejectedSteps) || await descendFromCanopy(here)) {
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

async function feedAdoptedDog(action, id, bed, mealCount) {
  const visited = [];
  for (let attempt = 0; attempt < 30; attempt++) {
    if (await visible(action, id)) {
      await action('interact_entity', { entityId: id });
      await setTimeout(350);
      const remaining = count(await action('get_inventory'), MUTTON);
      if (remaining === mealCount - 1) return;
      assert.equal(remaining, mealCount, 'A single feeding consumed more than one meal');
    }
    if (attempt % 3 === 2) {
      const player = await action('observe');
      const dog = (await action('get_entities', { type: DOG, radius: 16 })).entities.find(entity => entity.id === id);
      if (dog?.distance > 3 && attempt >= 5) {
        visited.push(feet(player));
        await stepOut(action, player, visited, dog.pos);
      } else if (dog && attempt >= 8) {
        await action('go_to', { entityId: id, stopDistance: 2, maxTicks: 20 });
      } else if (!dog && attempt >= 5) {
        await action('go_to', { pos: bed, stopDistance: 2, maxTicks: 55 });
      }
    }
    await setTimeout(150);
  }
  throw new Error('Could not feed the adopted dog after checking reach and the native crosshair');
}

export async function adoptAtNight(action, craft, descendFromCanopy) {
  const color = await gatherWool(action, descendFromCanopy);
  await ensurePlanks(action, craft, 3);
  // Bring the first table to the flock so sleeping doesn't depend on retracing the route.
  const table = await placeBeside(action, 'minecraft:crafting_table');
  assert.equal((await action('interact_block', { pos: table }))?.screenOpened, 'CraftingScreen');
  const bed = `minecraft:${color}_bed`;
  await craft(bed, 1);
  await action('stop', { closeScreen: true });
  const bedPos = await placeBeside(action, bed);
  await prepareCamp(action, craft, table, bedPos);
  await hold(action, MUTTON);
  const mealCount = count(await action('get_inventory'), MUTTON);

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
      await feedAdoptedDog(action, pup.id, bedPos, mealCount);
      return { table, bed: bedPos };
    }
    if (!player.screen && player.timeOfDay >= 12_542 && player.timeOfDay < 23_460) {
      await action('interact_block', { pos: bedPos, face: 'up' });
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

async function descendQuarry(action, player, bed, stairs, protectedGround) {
  const start = feet(player);
  const { cells } = await action('get_blocks', { center: start, size: [7, 7, 7], format: 'json' });
  const step = quarryStep(cells, start, bed, stairs);
  if (!step) return false;
  for (const pos of step.clear) {
    if (!await breakVisible(action, pos)) return false;
  }
  const outcome = await action('go_to', { pos: step.landing, stopDistance: 0.3, maxTicks: 45 });
  if (!outcome?.arrived || feet(await action('observe')).join(',') !== step.landing.join(',')) return false;
  const [x, y, z] = start;
  const [tx, ty, tz] = step.landing;
  for (const support of [[x, y - 1, z], [tx, ty - 1, tz]]) protectedGround.add(support.join(','));
  stairs.push(start);
  return true;
}

async function openCampTable(action, table, visited) {
  for (let attempt = 0; attempt < 24; attempt++) {
    const player = await action('observe');
    if (Math.hypot(player.position.x - table[0] - 0.5, player.position.y - table[1],
      player.position.z - table[2] - 0.5) < 3.6
      && (await action('interact_block', { pos: table }))?.screenOpened === 'CraftingScreen') return;
    visited.push(feet(player));
    await stepOut(action, player, visited, table);
  }
  throw new Error('Could not walk back to the crafting table after quarrying');
}

export async function earnStoneKit(action, craft, { table, bed }) {
  await hold(action, PICKAXE);
  const visited = [];
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
    if (await mineVisible(action, bed, mined, ore, drops, protectedGround)) {
      missedStone = 0;
      continue;
    }
    const player = await action('observe');
    missedStone++;
    if ((stairs.length > 0 || missedStone >= 8) && stairs.length < 7
        && await descendQuarry(action, player, bed, stairs, protectedGround)) continue;
    const position = feet(player);
    const distance = Math.hypot(position[0] - table[0], position[2] - table[2]);
    visited.push(position);
    await stepOut(action, player, visited, distance > 40 ? table : undefined);
  }
  for (const pos of stairs.reverse()) {
    const step = await action('go_to', { pos, stopDistance: 0.4, maxTicks: 65 });
    assert.ok(step?.arrived, 'Could not walk back up the quarry stairs');
  }
  if (count(await action('get_inventory'), 'minecraft:stick') < 2) {
    await ensurePlanks(action, craft, 2);
    await craft('minecraft:stick', 4);
  }
  await openCampTable(action, table, visited);
  const inventory = await action('get_inventory');
  const furnace = count(inventory, FURNACE);
  assert.ok(count(inventory, COBBLESTONE) >= (furnace ? 3 : 11), 'Could not earn enough cobblestone for a pickaxe and furnace');
  await craft(STONE_PICKAXE, 1);
  if (!furnace) await craft(FURNACE, 1);
  await action('stop', { closeScreen: true });
}

export async function earnIronKit(action, craft, { bed }) {
  const visited = [];
  const mined = new Set();
  const drops = new Set([RAW_IRON, COAL]);
  await hold(action, STONE_PICKAXE);
  for (let attempt = 0; attempt < 140; attempt++) {
    const inventory = await action('get_inventory');
    const wanted = new Set();
    if (count(inventory, RAW_IRON) < IRON_NEEDED) {
      wanted.add('minecraft:iron_ore');
      wanted.add('minecraft:deepslate_iron_ore');
    }
    if (!count(inventory, COAL)) wanted.add('minecraft:coal_ore');
    if (!wanted.size) break;
    const player = await action('observe');
    if (player.food <= 16 && count(inventory, MUTTON) > 1) {
      await hold(action, MUTTON);
      await action('use_item', { ticks: 36 });
      await hold(action, STONE_PICKAXE);
    }
    if (await mineVisible(action, bed, mined, wanted, drops)) continue;
    visited.push(feet(player));
    await stepOut(action, player, visited);
  }
  const materials = await action('get_inventory');
  assert.ok(count(materials, RAW_IRON) >= IRON_NEEDED && count(materials, COAL) > 0,
    'Could not earn enough reachable iron ore and coal for the expedition kit');
  await ensurePlanks(action, craft, 10);
  if (count(await action('get_inventory'), 'minecraft:stick') < 2) {
    await ensurePlanks(action, craft, 12);
    await craft('minecraft:stick', 4);
  }
  await craft('minecraft:crafting_table', 1);
  const table = await placeBeside(action, 'minecraft:crafting_table');
  const furnace = await placeBeside(action, FURNACE);
  await action('interact_block', { pos: furnace });
  await smeltExpeditionIron(action, IRON_NEEDED);
  await action('stop', { closeScreen: true });
  await openCampTable(action, table, visited);
  for (const item of ['minecraft:iron_pickaxe', 'minecraft:bucket', 'minecraft:shield']) {
    await craft(item, 1);
  }
  await action('stop', { closeScreen: true });
}
