import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import { breakVisible, eatExpeditionMeal, ensurePlanks, feedAdoptedDog, hold, hunt, placeBeside,
  retreatFromNearbyMob, sleepNearby, stepOut } from './expedition-home.mjs';
import { openExpeditionTable } from './expedition-gear.mjs';
import { refillEndBucket } from './expedition-dragon-fight.mjs';
import { OVERWORLD, withCompanion } from './expedition-nether.mjs';
import { cookExpeditionFood } from './expedition-furnace.mjs';

const ARROW = 'minecraft:arrow';
const BOW = 'minecraft:bow';
const BUCKET = 'minecraft:bucket';
const WATER = 'minecraft:water_bucket';
const GRAVEL = 'minecraft:gravel';
const FLINT = 'minecraft:flint';
const STICK = 'minecraft:stick';
const STRING = 'minecraft:string';
const FEATHER = 'minecraft:feather';
const FURNACE = 'minecraft:furnace';
const DOG = 'mushroom_yorkie:mushroom_yorkie';
const IRON_SWORD = 'minecraft:iron_sword';
const STONE_SWORD = 'minecraft:stone_sword';
const COBBLESTONE = 'minecraft:cobblestone';
const RAW_MEAT = ['mutton', 'beef', 'porkchop', 'chicken'].map(item => `minecraft:${item}`);
const FOOD = RAW_MEAT.map(item => item.replace('minecraft:', 'minecraft:cooked_')).concat('minecraft:bread');
const ANIMALS = new Map([['minecraft:chicken', 'minecraft:chicken'], ['minecraft:pig', 'minecraft:porkchop'],
  ['minecraft:cow', 'minecraft:beef'], ['minecraft:sheep', 'minecraft:mutton']]);
const AMMUNITION = 96;
const RATIONS = 16;
const count = (inventory, id) => inventory.slots.reduce((sum, stack) => sum + (stack.id === id ? stack.count : 0), 0);
const feet = ({ position: { x, y, z } }) => [x, y, z].map(Math.floor);
const strength = item => (item.maxDamage ?? 0) - (item.damage ?? 0);
const within = (pos, { x, y, z }, height = 0) =>
  Math.hypot(pos[0] + 0.5 - x, pos[1] + 0.5 - y - height, pos[2] + 0.5 - z);

export function endKitNeeds(inventory, arrows = AMMUNITION, rations = RATIONS) {
  const bow = !inventory.slots.some(stack => stack.id === BOW && strength(stack) >= arrows + 12);
  const sword = !inventory.slots.some(stack => [IRON_SWORD, STONE_SWORD].includes(stack.id) && strength(stack) >= 40);
  const batches = Math.max(0, Math.ceil((arrows - count(inventory, ARROW)) / 4));
  const food = FOOD.reduce((sum, id) => sum + count(inventory, id), 0);
  const rawFood = RAW_MEAT.reduce((sum, id) => sum + count(inventory, id), 0);
  return { bow, sword, batches, food: Math.max(0, rations - food), rawFood,
    flint: Math.max(0, batches - count(inventory, FLINT)), feathers: Math.max(0, batches - count(inventory, FEATHER)),
    string: bow ? Math.max(0, 3 - count(inventory, STRING)) : 0,
    sticks: Math.max(0, batches + 3 * Number(bow) + Number(sword) - count(inventory, STICK)),
    water: Math.max(0, 2 - count(inventory, WATER)),
    blocks: Math.max(0, 32 + 2 * Number(sword)
      + 8 * Number(food < rations && !count(inventory, FURNACE)) - count(inventory, COBBLESTONE)) };
}

async function pickUp(action, ids, radius = 7) {
  const view = await action('get_entities', { type: 'item', radius, max: 24 });
  const item = view?.entities.find(entity => ids.includes(entity.item?.id));
  if (!item) return false;
  await action('go_to', { entityId: item.id, stopDistance: 0.3, maxTicks: 36 });
  await setTimeout(150);
  return true;
}

async function gatherStone(action, player, state) {
  const wanted = state.material;
  const scanId = wanted === 'flint' ? 'gravel' : 'stone';
  const wide = state.round % 4 === 0;
  const view = await action('scan_blocks', { blocks: [scanId], radius: wide ? 32 : 16, max: 64 });
  const positions = view?.matches?.find(group => group.name === `minecraft:${scanId}`)?.positions ?? [];
  const here = feet(player);
  const viable = positions.filter(pos => pos[1] >= here[1] && pos[1] <= here[1] + 4
    && !state.mined.has(String(pos)));
  viable.sort((a, b) => within(a, player.position) - within(b, player.position));
  const nearby = viable.filter(pos => within(pos, player.position, 1.62) < 4.1);
  if (await pickUp(action, wanted === 'flint' ? [FLINT, GRAVEL] : [COBBLESTONE])) return true;
  for (const pos of nearby.slice(0, 6)) {
    state.mined.add(String(pos));
    if ((await breakVisible(action, pos))?.broken) return true;
  }
  // Reuse loose gravel on dry ground if no vein is within easy reach.
  if (wanted === 'flint' && state.stock.slots.some(stack => stack.id === GRAVEL)) {
    const placed = await placeBeside(action, GRAVEL);
    if ((await breakVisible(action, placed))?.broken) return true;
  }
  return stepOut(action, player, state.visited, viable.find(pos => !state.mined.has(String(pos))),
    'stone', state.rejected);
}

async function forageCombatKit(action, uuid, config, report) {
  const visited = [];
  const rejected = new Set();
  const tried = new Map();
  const mined = new Set();
  let nextLog = 0;
  for (let round = 0; round < 520; round++) {
    const stock = await action('get_inventory');
    const needs = endKitNeeds(stock, config.arrows, config.rations);
    const huntingFood = needs.rawFood < needs.food + Number(needs.food > 0);
    const next = needs.string ? STRING : needs.feathers ? FEATHER : huntingFood ? 'food' : null;
    if (!next && !needs.flint && !needs.blocks) return;
    const player = await action('observe');
    assert.ok(player?.inWorld && !player.dead && player.dimension === OVERWORLD && player.health >= 10,
      'End preparations need safe ground and a healthy player');
    if (!player.onGround) {
      await setTimeout(150);
      continue;
    }
    if (await retreatFromNearbyMob(action, next === STRING ? { ...player,
      threats: player.threats?.filter(threat => threat.type !== 'minecraft:spider') } : player, visited, rejected)) continue;
    const dogs = await action('get_entities', { type: DOG, radius: 24 });
    const dog = dogs?.entities.find(entity => entity.uuid === uuid && entity.health > 0);
    if (dog?.health <= 8 && await feedAdoptedDog(action, uuid, feet(player), 18)) continue;
    if (player.food <= 16) {
      const food = [...FOOD, ...RAW_MEAT].find(id => count(stock, id));
      if (food && await eatExpeditionMeal(action, player, food)) continue;
    }
    if (next !== STRING && await sleepNearby(action, player)) continue;
    if (player.gameTime >= nextLog) {
      await report('supplies', needs);
      nextLog = player.gameTime + 600;
    }
    visited.push(feet(player));
    if (!next) {
      await gatherStone(action, player, { material: needs.flint ? 'flint' : 'stone', round, mined, stock, visited, rejected });
      continue;
    }
    if (await pickUp(action, next === 'food' ? RAW_MEAT : [next])) continue;
    const view = await action('get_entities', { radius: round % 4 ? 32 : 64, max: 128 });
    const animal = view?.entities.find(entity => (next === STRING ? entity.type === 'minecraft:spider'
      : next === FEATHER ? entity.type === 'minecraft:chicken' : ANIMALS.has(entity.type))
        && (tried.get(entity.id) ?? -12) < round - 9 && Math.abs(entity.pos[1] - player.position.y) < 6);
    if (animal?.distance <= 6 && (next !== STRING || player.health >= 15)) {
      tried.set(animal.id, round);
      const canHunt = async () => {
        const observed = await action('observe');
        return observed?.health >= 12 && !observed.threats?.some(threat => threat.id !== animal.id && threat.distance < 5);
      };
      if (await hunt(action, animal, id => id === next || id === ANIMALS.get(animal.type), canHunt)) continue;
    }
    await stepOut(action, player, visited, animal?.pos, animal && animal.pos[1] > player.position.y + 2
      ? 'elevation' : 'grass', rejected);
  }
  throw new Error('Could not earn the bow materials, arrow supplies, and rations for the End');
}

async function fillExpeditionBuckets(action, wanted) {
  const visited = [];
  const rejected = new Set();
  const tried = new Set();
  for (let attempt = 0; attempt < 64 && wanted > 0; attempt++) {
    const player = await action('observe');
    assert.ok(player?.inWorld && !player.dead && player.health >= 10, 'Could not safely reach water');
    if (await retreatFromNearbyMob(action, player, visited, rejected)) continue;
    let candidates = [];
    // Use a smaller cube first. A broad scan can fill the result limit with
    // distant lower water before it reaches a pool beside the player.
    for (const radius of [6, 14, 32]) {
      const scan = await action('scan_blocks', { blocks: ['water'], radius, max: 256, waterSourcesOnly: true });
      assert.ok(scan?.waterSourcesOnly, 'End preparations require the bridge with native water source filtering');
      candidates = (scan.matches.find(match => match.name === 'minecraft:water')?.positions ?? [])
        .filter(pos => !tried.has(String(pos)) && Math.abs(pos[1] - player.position.y) < 6);
      if (candidates.length) break;
    }
    candidates.sort((a, b) => within(a, player.position, 1.62) - within(b, player.position, 1.62));
    const water = candidates[0];
    if (water && within(water, player.position, 1.62) <= 4.15) {
      if (await refillEndBucket(action, await action('get_inventory'), water)) wanted--;
      tried.add(String(water));
      continue;
    }
    visited.push(feet(player));
    if (!await stepOut(action, player, visited, water, 'surface', rejected, undefined, undefined, 50) && water) {
      tried.add(String(water));
    }
  }
  assert.equal(wanted, 0, 'Could not fill the carried water buckets before entering the End');
}

async function cookRations(action, craft, needed) {
  if (!needed) return;
  await ensurePlanks(action, craft, Math.ceil(needed / 1.5) + RAW_MEAT.length - 1 + 4);
  const stock = await action('get_inventory');
  if (!count(stock, FURNACE)) {
    await openExpeditionTable(action, craft);
    await craft(FURNACE, 1);
    await action('stop', { closeScreen: true });
  }
  const pos = await placeBeside(action, FURNACE);
  assert.equal((await action('interact_block', { pos }))?.screenOpened, 'FurnaceScreen');
  try {
    while (needed > 0) {
      const menu = await action('get_container');
      const inventory = menu.slots.filter(item => item.section === 'player');
      const meat = inventory.find(item => RAW_MEAT.includes(item.id));
      const fuel = Math.max(0, ...inventory.filter(item => item.id.endsWith('_planks')).map(item => item.count));
      if (!meat || !fuel) break;
      const amount = Math.min(needed, meat.count, Math.floor(fuel * 1.5));
      await cookExpeditionFood(action, meat.id, amount);
      needed -= amount;
    }
  } finally {
    await action('stop', { closeScreen: true });
  }
  assert.equal(needed, 0, 'The collected ingredients did not provide enough cooked rations');
}

export async function prepareEndCombatKit(action, craft, uuid, report = async () => {}, options = {}) {
  const config = { arrows: options.arrows ?? AMMUNITION, rations: options.rations ?? RATIONS };
  const original = await action('get_inventory');
  const buckets = count(original, WATER) + count(original, BUCKET);
  assert.ok(buckets >= 2, 'The iron phase must provide two buckets before End preparation');
  await forageCombatKit(action, uuid, config, report);
  const needs = endKitNeeds(await action('get_inventory'), config.arrows, config.rations);
  const sticks = needs.sticks;
  if (sticks) {
    await ensurePlanks(action, craft, Math.ceil(sticks / 4) * 2);
    await craft(STICK, 4 * Math.ceil(sticks / 4));
  }
  if (needs.bow || needs.batches || needs.sword) {
    await openExpeditionTable(action, craft);
    try {
      if (needs.bow) await craft(BOW, 1);
      if (needs.batches) await craft(ARROW, needs.batches * 4);
      if (needs.sword) await craft(STONE_SWORD, 1);
    } finally {
      await action('stop', { closeScreen: true });
    }
  }
  await cookRations(action, craft, needs.food);
  if (needs.water) await fillExpeditionBuckets(action, needs.water);
  await withCompanion(action, OVERWORLD, uuid);
  const packed = endKitNeeds(await action('get_inventory'), config.arrows, config.rations);
  assert.ok(!packed.bow && !packed.batches && !packed.sword && !packed.food && !packed.water && !packed.blocks,
    'The prepared End kit was not present in the native inventory');
  await report('packed', { arrows: config.arrows, rations: config.rations, water: 2 });
}
