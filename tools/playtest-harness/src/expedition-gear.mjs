import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import { ensurePlanks, hold, hunt, placeBeside, retreatFromNearbyMob, stepOut, visible } from './expedition-home.mjs';

const HARNESS = 'mushroom_yorkie:yorkie_harness';
const VEST = 'mushroom_yorkie:padded_vest';
const MAT = 'mushroom_yorkie:camp_mat';
const TABLE = 'minecraft:crafting_table';
const DOG = 'mushroom_yorkie:mushroom_yorkie';
const LEATHER = 'minecraft:leather';
const STRING = 'minecraft:string';
const INK = 'minecraft:ink_sac';
const DYE = 'minecraft:black_dye';
const WOOL = /^minecraft:[a-z_]+_wool$/;
const GEAR = [HARNESS, VEST, MAT];
export const COMPANION_WEARABLES = [HARNESS, VEST];
const count = (stock, item) => stock.slots.reduce((total, stack) => total + (stack.id === item ? stack.count : 0), 0);
const feet = ({ position: { x, y, z } }) => [x, y, z].map(Math.floor);

export function gearNeeds(stock, equipped = []) {
  const missing = GEAR.filter(item => !equipped.includes(item) && !count(stock, item));
  const harness = Number(missing.includes(HARNESS));
  const vest = Number(missing.includes(VEST));
  const mat = Number(missing.includes(MAT));
  const wool = stock.slots.reduce((total, stack) => total + (WOOL.test(stack.id) ? stack.count : 0), 0);
  return { missing, leather: Math.max(0, 2 * harness + vest - count(stock, LEATHER)),
    string: Math.max(0, 3 * harness + vest + mat - count(stock, STRING)),
    wool: Math.max(0, 2 * (vest + mat) - wool),
    dye: Boolean(harness && !count(stock, DYE)), ink: Boolean(harness && !count(stock, DYE) && !count(stock, INK)) };
}

async function gatherGearSupplies(action, equipped) {
  const visited = [];
  const rejectedSteps = new Set();
  const tried = new Map();
  for (let round = 0; round < 160; round++) {
    const wanted = gearNeeds(await action('get_inventory'), equipped);
    if (!wanted.leather && !wanted.string && !wanted.wool && !wanted.ink) return wanted;
    const player = await action('observe');
    assert.ok(player?.inWorld && !player.dead && player.health > 9, 'Companion equipment scavenging needs a healthy player');
    const sources = {
      'minecraft:cow': wanted.leather ? item => item === LEATHER || item === 'minecraft:beef' : null,
      'minecraft:sheep': wanted.wool ? item => WOOL.test(item) || item === 'minecraft:mutton' : null,
      'minecraft:spider': wanted.string && player.health >= 14 ? item => item === STRING : null,
      'minecraft:squid': wanted.ink ? item => item === INK : null,
    };
    // A deliberate, healthy hunt for string still yields to other nearby hostiles.
    const fleeing = sources['minecraft:spider'] ? {
      ...player, threats: player.threats?.filter(threat => threat.type !== 'minecraft:spider'),
    } : player;
    if (await retreatFromNearbyMob(action, fleeing, visited, rejectedSteps)) continue;

    const nearby = await action('get_entities', { radius: 32, max: 96 });
    const loose = nearby?.entities.find(entity => entity.distance <= 6 && entity.item?.id
      && (wanted.leather && entity.item.id === LEATHER || wanted.string && entity.item.id === STRING
        || wanted.wool && WOOL.test(entity.item.id) || wanted.ink && entity.item.id === INK));
    if (loose && (await action('go_to', { entityId: loose.id, stopDistance: 0.3, maxTicks: 40 }))?.arrived) continue;
    const animal = nearby?.entities.find(entity => sources[entity.type] && (tried.get(entity.id) ?? -10) < round - 3
      && Math.abs(entity.pos[1] - player.position.y) <= 2.5
      && (entity.type !== 'minecraft:squid' || entity.distance <= 8));
    if (animal?.distance <= 6) {
      tried.set(animal.id, round);
      if (await hunt(action, animal, sources[animal.type])) continue;
    }
    visited.push(feet(player));
    await stepOut(action, player, visited, animal?.pos, animal ? undefined : 'grass', rejectedSteps);
  }
  throw new Error('Could not gather wool, leather, string and black dye for Mushroom’s expedition gear');
}

async function findTable(action, craft) {
  const player = await action('observe');
  const area = await action('get_blocks', { center: feet(player), size: [7, 5, 7], format: 'json' });
  for (const cell of area?.cells.filter(cell => cell.b === TABLE) ?? []) {
    const pos = [cell.x, cell.y, cell.z];
    if (!await action('look', { at: pos })) continue;
    if (String((await action('observe'))?.crosshair?.pos) === String(pos)
        && (await action('interact_block', { pos }))?.screenOpened === 'CraftingScreen') return;
  }
  if (!count(await action('get_inventory'), TABLE)) {
    await ensurePlanks(action, craft, 4);
    await craft(TABLE, 1);
  }
  const pos = await placeBeside(action, TABLE);
  assert.equal((await action('interact_block', { pos }))?.screenOpened, 'CraftingScreen');
}

async function aimAtDog(action, uuid) {
  for (let attempt = 0; attempt < 16; attempt++) {
    const view = await action('get_entities', { type: DOG, radius: 24 });
    const dog = view?.entities.find(entity => entity.uuid === uuid && entity.health > 0);
    if (dog?.distance <= 4.2 && await visible(action, dog.id)) return dog.id;
    if (dog?.distance > 4.2 && dog.distance < 12) {
      await action('go_to', { entityId: dog.id, stopDistance: 2.2, maxTicks: 40 });
    }
    await setTimeout(325);
  }
  throw new Error('Could not reach the original dog to use the expedition gear');
}

export async function prepareCompanionGear(action, craft, uuid, equipped = [], recordEquipped = async () => {}) {
  const wanted = await gatherGearSupplies(action, equipped);
  if (wanted.dye) await craft(DYE, 1);
  if (wanted.missing.length) {
    await findTable(action, craft);
    try {
      for (const item of wanted.missing) await craft(item, 1);
    } finally {
      await action('stop', { closeScreen: true });
    }
  }
  for (const item of COMPANION_WEARABLES) {
    if (equipped.includes(item)) continue;
    await hold(action, item);
    const before = count(await action('get_inventory'), item);
    assert.ok(before, `Could not find the crafted ${item}`);
    assert.ok((await action('interact_entity', { entityId: await aimAtDog(action, uuid) }))?.success,
      `Could not use ${item} on the original dog`);
    await setTimeout(350);
    assert.equal(count(await action('get_inventory'), item), before - 1, `The original dog did not accept ${item}`);
    await recordEquipped(item);
  }
}

async function selectEmptyHand(action) {
  const stock = await action('get_inventory');
  const occupied = new Set(stock.slots.map(stack => stack.slot));
  let slot = Array.from({ length: 9 }, (_, index) => index).find(index => !occupied.has(index));
  if (slot === undefined) {
    const free = Array.from({ length: 27 }, (_, index) => index + 9).find(index => !occupied.has(index));
    assert.notEqual(free, undefined, 'The player needs an empty inventory slot to use the camp');
    slot = stock.selectedSlot;
    await action('click_slot', { slot: free, action: 'swap', hotbar: slot });
  }
  await action('select_slot', { slot });
  assert.ok(!(await action('get_inventory')).mainHand?.count, 'Camp marking requires the empty main hand');
}

export async function markExpeditionCamp(action) {
  const pos = await placeBeside(action, MAT);
  await selectEmptyHand(action);
  await setTimeout(180);
  assert.ok((await action('interact_block', { pos, face: 'up' }))?.success, 'The owner could not mark the placed camp mat');
  return pos;
}

export async function practiceStayAndRecall(action, uuid) {
  await useEmptyHandOnCompanion(action, uuid);
  await setTimeout(1_200);
  await useEmptyHandOnCompanion(action, uuid);
}

export async function useEmptyHandOnCompanion(action, uuid) {
  await selectEmptyHand(action);
  assert.ok((await action('interact_entity', { entityId: await aimAtDog(action, uuid) }))?.success,
    'Mushroom did not accept the stay or recall interaction');
}
