import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import { dryWaypoint, leavesBlockingExit, nearbyBuildingSpots } from './expedition-navigation.mjs';

const WOOL = /^minecraft:(.+)_wool$/;
const MUTTON = 'minecraft:mutton';
const DOG = 'mushroom_yorkie:mushroom_yorkie';
const PICKAXE = 'minecraft:wooden_pickaxe';
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

async function stepOut(action, player, visited, destination, seekPasture = false) {
  const center = feet(player);
  const volume = await action('get_blocks', { center, size: [17, 9, 17], format: 'json' });
  const pos = dryWaypoint(volume.cells, center, visited, destination, seekPasture);
  const repeated = visited.filter(tile => tile.every((coordinate, axis) => coordinate === center[axis])).length > 2;
  if (!pos || repeated) {
    const leaf = leavesBlockingExit(volume.cells, center);
    if (leaf && (await action('break_block', { pos: leaf, maxTicks: 30 }))?.broken) return true;
    if (!pos) return false;
  }
  const result = await action('go_to', { pos, stopDistance: 0.3, maxTicks: 90 });
  return result?.arrived || Math.hypot(result?.position?.[0] - player.position.x,
    result?.position?.[2] - player.position.z) >= 0.6;
}

async function gatherWool(action, descendFromCanopy) {
  const visited = [];
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
    if (await stepOut(action, here, visited, sheep?.pos, !sheep) || await descendFromCanopy(here)) {
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
  for (const pos of nearbyBuildingSpots(cells, player.position, item.endsWith('_bed'))) {
    const result = await action('place_block', { pos });
    if (result?.placed && result.blockAtPos === item) return pos;
  }
  throw new Error(`No nearby supported position for ${item}`);
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

async function feedAdoptedDog(action, id) {
  await hold(action, MUTTON);
  const before = count(await action('get_inventory'), MUTTON);
  for (let attempt = 0; attempt < 12; attempt++) {
    if (attempt % 3 === 0) {
      await action('go_to', { entityId: id, stopDistance: attempt ? 1.05 : 1.65, maxTicks: 45 });
    }
    if (await visible(action, id)) {
      await action('interact_entity', { entityId: id });
      await setTimeout(350);
      const remaining = count(await action('get_inventory'), MUTTON);
      if (remaining === before - 1) return;
      assert.equal(remaining, before, 'A single feeding consumed more than one meal');
    }
    await setTimeout(150);
  }
  throw new Error('Could not feed the adopted dog after checking reach and the native crosshair');
}

export async function adoptAtNight(action, craft, descendFromCanopy) {
  const color = await gatherWool(action, descendFromCanopy);
  // Bring the first table to the flock so sleeping doesn't depend on retracing the route.
  const table = await placeBeside(action, 'minecraft:crafting_table');
  assert.equal((await action('interact_block', { pos: table }))?.screenOpened, 'CraftingScreen');
  const bed = `minecraft:${color}_bed`;
  await craft(bed, 1);
  await action('stop', { closeScreen: true });
  const bedPos = await placeBeside(action, bed);
  await prepareCamp(action, craft, table, bedPos);

  for (let attempt = 0; attempt < 180; attempt++) {
    const player = await action('observe');
    assert.ok(player?.inWorld && !player.dead && player.health > 4, 'Lost a safe position beside the bed');
    const pup = (await action('get_entities', { type: DOG, radius: 8 })).entities.find(entity => entity.name === 'Mushroom');
    if (pup && !player.screen && (await action('get_inventory')).slots.some(stack => stack.id === 'mushroom_yorkie:field_guide')) {
      await feedAdoptedDog(action, pup.id);
      return;
    }
    if (!player.screen && player.timeOfDay >= 12_542 && player.timeOfDay < 23_460) {
      await action('interact_block', { pos: bedPos, face: 'up' });
    }
    // Let the actual cycle advance. Using the bed is the only action that advances it to morning.
    await setTimeout(player.screen ? 750 : 4500);
  }
  throw new Error('No native night sleep and adoption within the test window');
}
