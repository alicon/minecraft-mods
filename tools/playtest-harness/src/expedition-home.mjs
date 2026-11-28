import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import {
  buildingSpotsWithGroundCover, dryStepKey, dryWaypoint, exitObstruction, hasDrySupport, hasPlacedBed, nearbyBuildingSpots,
  missingQuarryExitSupport, nearestCover, planEmergencyDugout, quarryLandingIsClear, quarryStep, uphillScoutingStep, waterExitWaypoint,
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
const DIGGABLE = /^minecraft:(?:grass_block|dirt|coarse_dirt|rooted_dirt|dirt_path|podzol|mycelium|sand|red_sand|gravel|clay|soul_sand|snow_block)$/;
const MINEABLE = /^minecraft:(?:stone|cobblestone|end_stone|furnace|deepslate|andesite|diorite|granite|(?:deepslate_)?(?:coal|iron)_ore|iron_door|iron_bars|spawner|(?:cracked_|mossy_|chiseled_)?stone_bricks)$/;
const CHOPPABLE = /^minecraft:(?:crafting_table|\w+_(?:log|wood|planks))$/;
const TOOL_TIERS = ['netherite', 'diamond', 'iron', 'stone', 'wooden'];
const COBBLESTONE = 'minecraft:cobblestone';
const FURNACE = 'minecraft:furnace';
const RAW_IRON = 'minecraft:raw_iron';
const IRON_INGOT = 'minecraft:iron_ingot';
const COAL = 'minecraft:coal';
const CHARCOAL = 'minecraft:charcoal';
const SHIELD = 'minecraft:shield';
const IRON_RECIPES = [
  ['minecraft:iron_pickaxe', 3], ['minecraft:bucket', 3], [SHIELD, 1],
];
const SWORDS = TOOL_TIERS.map(tier => `minecraft:${tier}_sword`);
const CAMP_WORK_END = 11_900;
const BACKUP_MEAT = {
  'minecraft:chicken': 'minecraft:chicken',
  'minecraft:cow': 'minecraft:beef',
  'minecraft:pig': 'minecraft:porkchop',
};
const BACKUP_FOOD = [...Object.values(BACKUP_MEAT), 'minecraft:apple'];
const COOKED_FOOD = ['minecraft:cooked_mutton', 'minecraft:cooked_beef', 'minecraft:cooked_porkchop', 'minecraft:cooked_chicken'];
const DOG_FOOD = [MUTTON, ...Object.values(BACKUP_MEAT), ...COOKED_FOOD, 'minecraft:apple'];
const FEEDING_SEARCH_RADIUS = 24;
const FEEDING_OBSTRUCTION = /^minecraft:(?:stone|andesite|diorite|granite|dirt|grass_block)$/;
const WOOL_DYES = {
  white: ['minecraft:lily_of_the_valley', 'minecraft:bone_meal'],
  yellow: ['minecraft:dandelion'],
  red: ['minecraft:poppy', 'minecraft:red_tulip'],
  light_gray: ['minecraft:oxeye_daisy', 'minecraft:azure_bluet', 'minecraft:white_tulip'],
};

function isBedtime(player) {
  return player?.dimension === 'minecraft:overworld' && player.timeOfDay >= 12_542 && player.timeOfDay < 23_460;
}

export function careReturnNeedsCover(player, bed) {
  if (player.dimension !== 'minecraft:overworld' || !Number.isFinite(player.timeOfDay)
      || player.timeOfDay >= 23_500) return false;
  const remaining = Math.hypot(player.position.x - bed[0] - 0.5, player.position.z - bed[2] - 0.5);
  return remaining > 24 && player.timeOfDay + remaining * 8 >= 12_250;
}

function count({ slots }, item) {
  return slots.reduce((total, stack) => total + (stack.id === item ? stack.count : 0), 0);
}

export function dogMealCount(inventory) {
  return inventory.slots.reduce((total, stack) => total + (DOG_FOOD.includes(stack.id) ? stack.count : 0), 0);
}

export function spareExpeditionMeal(inventory) {
  if (dogMealCount(inventory) <= 1) return;
  return [...COOKED_FOOD, ...BACKUP_FOOD, MUTTON].find(item => count(inventory, item));
}

export async function packRecoveryMeal(action) {
  const { slots } = await action('get_inventory');
  const meals = slots.filter(stack => DOG_FOOD.includes(stack.id));
  if (!meals.length || meals.some(stack => stack.slot >= 9)) return;
  const free = Array.from({ length: 27 }, (_, index) => index + 9)
    .find(slot => !slots.some(stack => stack.slot === slot));
  if (free === undefined) return;
  await action('stop', { closeScreen: true });
  await action('click_slot', { slot: free, action: 'swap', hotbar: meals[0].slot });
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

export async function findDyeFlower(action, player, stock, tried) {
  const plants = Object.values(WOOL_DYES).flat().filter(item => !item.endsWith('bone_meal'));
  const scan = await action('scan_blocks', { blocks: plants, radius: 24, max: 12 });
  const { x, y, z } = player.position;
  return scan?.matches.flatMap(({ name, positions }) => positions.map(pos => ({ name, pos,
    distance: Math.hypot(pos[0] + 0.5 - x, pos[1] - y, pos[2] + 0.5 - z),
  }))).filter(item => Math.abs(item.pos[1] - y) < 3 && !tried.has(String(item.pos)))
    .sort((a, b) => {
      const score = flower => {
        const color = Object.keys(WOOL_DYES).find(key => WOOL_DYES[key].includes(flower.name));
        const wool = count(stock, `minecraft:${color}_wool`);
        const dye = count(stock, `minecraft:${color}_dye`);
        const ingredients = WOOL_DYES[color].reduce((total, item) => total + count(stock, item), 0);
        const shortage = Math.max(0, 3 - wool - dye - ingredients);
        return flower.distance + shortage * 5;
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

export async function eatExpeditionMeal(action, player, meal, pitch = -75) {
  if (player.screen) await action('stop', { closeScreen: true });
  // Use can reopen the table or activate the bed if the crosshair stays on it.
  await action('look', { pitch });
  await hold(action, meal);
  const result = await action('use_item', { ticks: 36 });
  if (!result?.completed) return false;
  return (result.food ?? 0) > player.food || ((await action('observe'))?.food ?? 0) > player.food;
}

async function aimAtEntity(action, entityId) {
  if (!await action('look', { entityId })) return null;
  await setTimeout(110);
  return action('observe');
}

export async function visible(action, entityId) {
  return (await aimAtEntity(action, entityId))?.crosshair?.id === entityId;
}

export async function hunt(action, animal, dropMatches, canContinue) {
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
  const visited = [];
  const rejectedSteps = new Set();
  let blockedApproaches = 0;
  for (let hit = 0; hit < 12;) {
    if (canContinue && !await canContinue()) return false;
    const present = (await action('get_entities', { type: animal.type, radius: 16 })).entities
      .find(entity => entity.id === animal.id);
    if (!present) return false;
    const near = await action('go_to', { entityId: animal.id, stopDistance: 1.65, maxTicks: 40 });
    if (!near?.arrived || !await visible(action, animal.id)) {
      if (++blockedApproaches > 3 || !present.pos) return false;
      const player = await action('observe');
      if (!player?.inWorld || player.dead || player.health < 8) return false;
      visited.push(feet(player));
      if (!await stepOut(action, player, visited, present.pos, 'surface', rejectedSteps)) return false;
      continue;
    }
    blockedApproaches = 0;
    if (canContinue && !await canContinue()) return false;
    await action('attack_entity', { entityId: animal.id });
    hit++;
    await setTimeout(725);
    const { entities } = await action('get_entities', { type: animal.type, radius: 16 });
    if (!entities.some(entity => entity.id === animal.id)) {
      if (canContinue && !await canContinue()) return false;
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

export async function stepOut(action, player, visited, destination, preferredGround, rejectedSteps = new Set(),
  chooseRoute, avoid, maxTicks = 90, { volume: observed, exactTargets } = {}) {
  const center = feet(player);
  if (preferredGround === 'stronghold' && player.onGround) center[1] = Math.ceil(player.position.y);
  const width = preferredGround || chooseRoute ? 23 : 17;
  const height = ['surface', 'elevation', 'uphill', 'cave', 'iron', 'downhill'].includes(preferredGround) ? 15 : 9;
  const volume = observed ?? await action('get_blocks', { center, size: [width, height, width], format: 'json' });
  if (!volume) return false;
  let pos = dryWaypoint(volume.cells, center, visited, destination, preferredGround, rejectedSteps, avoid, exactTargets);
  if ((avoid || exactTargets) && !pos) return false;
  const repeated = visited.filter(tile => tile.every((coordinate, axis) => coordinate === center[axis])).length > 2;
  if (!exactTargets && (!pos || repeated)) {
    const obstruction = exitObstruction(volume.cells, center, preferredGround === 'surface' ? destination : undefined);
    if (obstruction) {
      const [x, y, z] = obstruction;
      const table = volume.cells.some(cell => cell.x === x && cell.y === y && cell.z === z
        && cell.b === 'minecraft:crafting_table');
      const removed = table ? await breakVisible(action, obstruction)
        : await action('break_block', { pos: obstruction, maxTicks: 30 });
      if (removed?.broken) return true;
    }
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
  const result = await action('go_to', { pos, stopDistance: 0.3, maxTicks });
  const wrongHeight = result?.arrived && Math.abs(result.position?.[1] - pos[1]) >= 0.9
    && !await settleOnDryStep(action, pos);
  const displacement = Math.hypot(result?.position?.[0] - player.position.x,
    result?.position?.[2] - player.position.z);
  // Downhill momentum can carry an overland walker past the exact tile.
  // Replan from the grounded observation instead of banning a usable exit.
  if (wrongHeight && ['surface', 'downhill'].includes(preferredGround) && displacement >= 0.6) return true;
  const moved = result?.arrived || displacement >= 0.6;
  if (wrongHeight || (!moved && result?.reason)) rejectedSteps.add(dryStepKey(center, pos));
  return !wrongHeight && moved;
}

export async function retreatFromNearbyMob(action, player, visited, rejectedSteps,
  warningDistance = 7, creeperWarning = 16, skeletonWarning = warningDistance) {
  // A scouting walk can cover ten blocks before the next observation.
  let danger;
  let pursuit;
  let hazards;
  for (const threat of player.threats ?? []) {
    const creeper = threat.type === 'minecraft:creeper';
    const warning = /:(?:skeleton|stray|bogged|parched)$/.test(threat.type) ? skeletonWarning : warningDistance;
    if (threat.distance > (creeper ? creeperWarning : warning)
        || (threat.type === 'minecraft:spider' && !isBedtime(player) && threat.distance > 3)) continue;
    pursuit = threat.distance < (warning > 7 ? 7 : 3) && !creeper;
    const surveyGroup = pursuit || warning > 7;
    const nearby = await action('get_entities', surveyGroup
      ? { radius: warning + 1, max: 96 } : { type: threat.type, radius: 18, max: 16 });
    const candidate = nearby?.entities.find(entity => entity.id === threat.id && entity.hostile);
    if (!candidate || (creeper && await separatedByRock(action, player, candidate))) continue;
    danger = { ...candidate, type: threat.type };
    hazards = surveyGroup
      ? nearby.entities.filter(entity => entity.hostile && entity.distance <= warning).map(entity => entity.pos)
      : danger.pos;
    break;
  }
  if (!danger) return false;
  const here = feet(player);
  const away = [here[0] + 8 * Math.sign(player.position.x - danger.pos[0]), here[1],
    here[2] + 8 * Math.sign(player.position.z - danger.pos[2])];
  visited.push(here);
  // A blow while running should not leave the player standing next to the pursuer.
  const restoreInterrupt = pursuit && (await action('set_reflexes'))?.interruptOnDamage;
  if (restoreInterrupt) await action('set_reflexes', { interruptOnDamage: false });
  try {
    if (await stepOut(action, player, visited, away, undefined, rejectedSteps, undefined, hazards,
      pursuit ? 40 : 90)) return true;
  } finally {
    if (restoreInterrupt) await action('set_reflexes', { interruptOnDamage: true });
  }
  if (danger.type !== 'minecraft:creeper') return false;
  await action('stop');
  await setTimeout(250);
  return true;
}

async function separatedByRock(action, player, threat) {
  const { x, y, z } = player.position;
  const [tx, ty, tz] = threat.pos;
  if (!player.onGround || y - ty < 6) return false;
  const from = [x, y + 1.3, z];
  const to = [tx, ty + 1.3, tz];
  const low = from.map((value, index) => Math.floor(Math.min(value, to[index])));
  const high = from.map((value, index) => Math.floor(Math.max(value, to[index])));
  const size = high.map((value, index) => value - low[index] + 1);
  const center = low.map((value, index) => value + Math.floor(size[index] / 2));
  const view = await action('get_blocks', { center, size, format: 'json' });
  if (!view || view.stats?.unloadedChunks) return false;
  const rock = new Set(view.cells.filter(cell =>
    /^minecraft:(?:stone|deepslate|andesite|diorite|granite|tuff|dirt|grass_block|cobblestone)$/.test(cell.b))
    .map(cell => String([cell.x, cell.y, cell.z])));
  let layers = 0;
  for (let height = Math.ceil(to[1]); height < high[1]; height++) {
    const progress = (from[1] - height - 0.5) / (from[1] - to[1]);
    const column = [Math.floor(x + progress * (tx - x)), height, Math.floor(z + progress * (tz - z))];
    if (rock.has(String(column)) && ++layers >= 3) return true;
  }
  return false;
}

function woolScoutDetour(trail) {
  const recent = trail.slice(-8);
  const origin = recent.at(-1);
  if (recent.length < 8 || recent.some(tile => Math.hypot(...tile.map((value, axis) => value - origin[axis])) > 4)) {
    return null;
  }
  const anchor = trail.slice(0, -8).findLast(([x, y, z]) => {
    const distance = Math.hypot(x - origin[0], z - origin[2]);
    return distance >= 9 && distance <= 18 && Math.abs(y - origin[1]) <= 12;
  });
  return { origin, anchor, steps: 0, best: Infinity, stalled: 0, walked: [], rejectedClimbs: new Set() };
}

export async function cutScoutingFoothold(action, player, detour) {
  if (!player.onGround || player.inWater || player.health < 12 || player.threats?.some(threat => threat.distance <= 8)) return false;
  const here = feet(player);
  const volume = await action('get_blocks', { center: here, size: [5, 9, 5], format: 'json' });
  const step = volume && !volume.stats?.unloadedChunks
    && uphillScoutingStep(volume.cells, here, detour.anchor, detour.rejectedClimbs, detour);
  if (!step) return false;
  detour.rejectedClimbs.add(String(step.landing));
  if (detour.protectedDog) {
    const [x, y, z] = detour.protectedDog.map(Math.floor);
    if (step.clear.some(([bx, by, bz]) => bx === x && bz === z && Math.abs(by - y) <= 1)) return false;
  }
  for (const block of step.clear) {
    if (!(await breakVisible(action, block))?.broken) return false;
  }
  return climbQuarry(action, step.landing);
}

export async function swimToDryGround(action, player, leaveShelf = false) {
  const shelf = leaveShelf ? String(feet(player)) : undefined;
  for (let pulse = 0; pulse < 48; pulse++) {
    if (!player?.inWorld || player.dead || player.health <= 0) return false;
    const fromShore = player.onGround && !player.inWater && String(feet(player)) === shelf;
    if (!player.inWater && player.onGround && !fromShore) return true;
    if (fromShore || player.inWater) {
      const center = feet(player);
      const volume = await action('get_blocks', { center, size: [35, 13, 35], format: 'json' });
      const route = volume && waterExitWaypoint(volume.cells, center, center[1] + 6,
        { fromShore, requireContinuation: leaveShelf });
      if (fromShore && !route?.waypoint) return false;
      const waypoint = route?.waypoint && player.air >= 270 && player.position.y >= route.surface - 0.6
        ? route.waypoint : null;
      if (waypoint) {
        const dx = waypoint[0] + 0.5 - player.position.x;
        const dz = waypoint[1] + 0.5 - player.position.z;
        const yaw = Math.atan2(-dx, dz) * 180 / Math.PI;
        await action('move', { yaw, forward: true, jump: !fromShore, ticks: 14 });
      } else {
        await action('move', { jump: true, ticks: 18 });
      }
    } else {
      await setTimeout(150);
    }
    player = await action('observe');
  }
  return Boolean(player?.inWorld && !player.dead && !player.inWater && player.onGround && String(feet(player)) !== shelf);
}

export async function gatherWool(action, descendFromCanopy, chooseRoute, craft, reportScouting, observedTrail = []) {
  const visited = [];
  const rejectedSteps = new Set();
  const triedAnimals = new Map();
  const triedFlowers = new Set();
  const blockedShelters = new Set();
  const scoutingTrail = [...observedTrail];
  const deferredSheep = new Map();
  let detour;
  let shelter;
  let dyeTarget;
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
    if (player.inWater) {
      await reportScouting?.('In water. Swim up for air and find a dry bank before scouting again.');
      assert.ok(await swimToDryGround(action, player), 'Could not swim to a verified dry bank while looking for sheep');
      stalls = 0;
      detour = undefined;
      scoutingTrail.length = 0;
      continue;
    }
    if (await retreatFromNearbyMob(action, player, visited, rejectedSteps)) continue;
    const meal = BACKUP_FOOD.find(item => count(inventory, item) > 0)
      ?? (count(inventory, MUTTON) > (player.food <= 8 ? 0 : 1) ? MUTTON : undefined);
    if (player.food <= 16 && meal) {
      await hold(action, meal);
      await action('use_item', { ticks: 36 });
    }
    if (detour) {
      const tile = feet(player);
      const [x, y, z] = tile;
      const anchorDistance = detour.anchor ? Math.hypot(...tile.map((value, axis) => value - detour.anchor[axis])) : Infinity;
      if (anchorDistance > 2 && Math.hypot(x - detour.origin[0], z - detour.origin[2]) < 9 && detour.steps++ < 28) {
        const goingUp = detour.anchor?.[1] > y + 1;
        if (detour.anchor) {
          if (anchorDistance < detour.best - 0.75) {
            detour.best = anchorDistance;
            detour.stalled = 0;
          } else if (++detour.stalled >= 3 && goingUp
              && await cutScoutingFoothold(action, player, detour)) {
            await reportScouting?.('Cut a dry foothold to climb back out of the ledge.');
            continue;
          }
        }
        // Ignore visits from the outbound trail, but count revisits while heading back.
        detour.walked.push(tile);
        const moved = await stepOut(action, player, detour.anchor ? detour.walked : visited, detour.anchor,
          goingUp ? 'uphill' : detour.anchor ? 'elevation' : 'grass', rejectedSteps);
        if (moved || await descendFromCanopy(player)) continue;
        if (goingUp && await cutScoutingFoothold(action, player, detour)) {
          await reportScouting?.('Cut a dry foothold to climb back out of the ledge.');
          continue;
        }
      }
      detour = undefined;
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
      && (!deferredSheep.has(entity.id) || Math.hypot(...entity.pos.map((value, axis) =>
        value - deferredSheep.get(entity.id)[axis])) >= 8)
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
      ? dyeTarget ?? await findDyeFlower(action, player, inventory, triedFlowers) : null;
    if (flower && (dyeTarget || !target || flower.distance < target.distance)) {
      const [fx, fy, fz] = flower.pos;
      const { x, y, z } = player.position;
      const distance = Math.hypot(fx + 0.5 - x, fy + 0.5 - y, fz + 0.5 - z);
      if (distance < 3.6) {
        dyeTarget = undefined;
        triedFlowers.add(String(flower.pos));
        if (await collectFlower(action, player, flower)) continue;
      } else {
        // The small scan can change as we move along a hillside. Keep using the
        // observed position until we reach it or stop getting any closer.
        const improved = distance < (dyeTarget?.best ?? Infinity) - 0.75;
        const stalled = improved ? 0 : (dyeTarget?.stalled ?? 0) + 1;
        if (stalled >= 6) {
          triedFlowers.add(String(flower.pos));
          dyeTarget = undefined;
        } else {
          dyeTarget = { ...flower, best: improved ? distance : dyeTarget.best, stalled };
          target = flower;
        }
      }
    }
    const here = await action('observe');
    const tile = feet(here);
    if (here.onGround && !here.inWater) {
      scoutingTrail.push(tile);
      if (sheep && target === sheep && sheep.distance > 6) {
        detour = woolScoutDetour(scoutingTrail);
        if (detour) {
          deferredSheep.set(sheep.id, sheep.pos);
          scoutingTrail.length = 0;
          await reportScouting?.('The route keeps returning to the same ground. Retracing a dry way out before looking for sheep again.');
          continue;
        }
      }
    }
    const next = target === sheep ? 'No sheep nearby. Looking for open grassland.'
      : flower === target ? 'Looking for dye to make the wool match.'
        : 'Looking for food before continuing the wool search.';
    await reportScouting?.(sheep && target === sheep
      ? `Saw a sheep about ${Math.round(sheep.distance)} blocks away. Following dry ground toward it.` : next);
    visited.push(tile);
    const terrain = target && target === flower ? 'elevation' : target ? undefined : 'grass';
    if (await stepOut(action, here, visited, target?.pos, terrain, rejectedSteps,
      sheep && target === sheep ? chooseRoute : undefined)
        || await descendFromCanopy(here)) {
      stalls = 0;
    } else {
      stalls++;
      if (stalls === 2 && here.onGround && await swimToDryGround(action, here, true)) {
        await reportScouting?.('Swam around the cliff to a bank with a dry walking route.');
        stalls = 0;
        scoutingTrail.length = 0;
        continue;
      }
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
  if (bed || item === 'minecraft:crafting_table') {
    spots.push(...buildingSpotsWithGroundCover(cells, player.position, bed));
  }
  for (const { pos, clear } of spots) {
    for (const cover of clear) await action('break_block', { pos: cover, maxTicks: 25 });
    if (bed) {
      // Bed orientation uses the player's rotation on the server.
      await action('look', { at: [pos[0], pos[1] - 1, pos[2]] });
      await setTimeout(175);
    }
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

async function harvestReachableLog(action, camp, timberSite) {
  const visited = [];
  const rejected = new Set();
  const attempted = new Set();
  const detoured = new Set();
  const scan = { blocks: WOOD_LOGS, radius: 12, max: 40 };
  const candidatesFrom = (view, { x, y, z }) => view.matches
    .flatMap(({ name, positions }) => positions.map(pos => ({ name, pos })))
    .filter(({ pos }) => !attempted.has(String(pos)))
    .filter(({ pos }) => Math.abs(pos[1] + 0.5 - y - 1.62) < 4)
    .filter(({ pos }) => !camp || Math.hypot(...pos.map((axis, index) => axis - camp[index])) <= 9)
    .sort((a, b) => Math.hypot(a.pos[0] + 0.5 - x, a.pos[1] + 0.5 - y - 1.62, a.pos[2] + 0.5 - z)
      - Math.hypot(b.pos[0] + 0.5 - x, b.pos[1] + 0.5 - y - 1.62, b.pos[2] + 0.5 - z));
  const initial = (await action('observe')).position;
  const remembered = timberSite && Math.hypot(timberSite[0] - initial.x, timberSite[2] - initial.z) <= 48
    && Math.abs(timberSite[1] - initial.y) <= 10 ? timberSite : undefined;
  const searchLimit = timberSite ? 32 : 8;
  let candidates = candidatesFrom(await action('scan_blocks', scan), initial);
  let scouting = 0;
  for (let attempt = 0; attempt < 8; attempt++) {
    while (!candidates.length) {
      const player = await action('observe');
      candidates = candidatesFrom(await action('scan_blocks', scan), player.position);
      if (candidates.length) break;
      if (camp || scouting++ >= searchLimit || !player.inWorld || player.dead || player.health < 8) return;
      if (!await retreatFromNearbyMob(action, player, visited, rejected)) {
        const wider = await action('scan_blocks', { ...scan, radius: 32 });
        const { x, y, z } = player.position;
        const target = candidatesFrom(wider, player.position)[0]?.pos
          ?? (remembered && Math.hypot(remembered[0] - x, remembered[2] - z) > 8 ? remembered : undefined);
        visited.push(feet(player));
        const terrain = !target && timberSite && y >= 88 ? 'downhill' : 'surface';
        if (!await stepOut(action, player, visited, target, terrain, rejected)) return;
      }
    }
    const tree = candidates.shift();
    attempted.add(String(tree.pos));
    const column = `${tree.pos[0]},${tree.pos[2]}`;
    const approach = () => action('go_to', { pos: tree.pos, stopDistance: 2.1, maxTicks: 65 });
    let approached = await approach();
    const leaves = approached?.reason?.match(/blocked by minecraft:\w+_leaves at (-?\d+),(-?\d+),(-?\d+)/);
    if (leaves && (await action('break_block', { pos: leaves.slice(1).map(Number), maxTicks: 30 }))?.broken) {
      approached = await approach();
    }
    if (!approached?.arrived) {
      if (detoured.has(column)) continue;
      detoured.add(column);
      for (let detour = 0; detour < 6; detour++) {
        const player = await action('observe');
        if (!player?.inWorld || player.dead || player.health < 8) return;
        const { x, y, z } = player.position;
        if (Math.hypot(tree.pos[0] + 0.5 - x, tree.pos[1] + 0.5 - y - 1.62, tree.pos[2] + 0.5 - z) <= 4) break;
        visited.push(feet(player));
        if (!await stepOut(action, player, visited, tree.pos, 'surface', rejected)) break;
      }
    }
    let visibleLog;
    for (let look = 0; look < 3; look++) {
      await action('look', { at: tree.pos });
      await setTimeout(80);
      const pose = await action('observe');
      const target = pose?.crosshair;
      if (target?.pos?.join(',') === tree.pos.join(',')
          || (target?.block === tree.name && target.pos?.[0] === tree.pos[0] && target.pos?.[2] === tree.pos[2]
            && target.pos[1] >= Math.floor(pose.position.y))) {
        visibleLog = target.pos;
        break;
      }
      if (!target?.block?.endsWith('_leaves')
          || !(await action('break_block', { pos: target.pos, maxTicks: 30 }))?.broken) break;
    }
    if (!visibleLog || !await selectBreakingTool(action, tree.name)) continue;
    const stock = count(await action('get_inventory'), tree.name);
    if (!(await action('break_block', { pos: visibleLog, maxTicks: 100 }))?.broken) continue;
    // A canopy drop can start outside the player's pickup area and fall into it.
    for (let check = 0; check < 4; check++) {
      const drops = await action('get_entities', { type: 'item', radius: 7 });
      const log = drops.entities.find(candidate => candidate.item?.id === tree.name);
      if (log) await action('go_to', { entityId: log.id, stopDistance: 0.3, maxTicks: 55 });
      await setTimeout(350);
      if (count(await action('get_inventory'), tree.name) > stock) return tree.name;
    }
  }
}

export async function ensurePlanks(action, craft, needed, timberSite) {
  for (let batch = 0; batch <= Math.ceil(needed / 4); batch++) {
    const { slots } = await action('get_inventory');
    const planks = slots.filter(stack => stack.id.endsWith('_planks')).reduce((total, stack) => total + stack.count, 0);
    if (planks >= needed) return;
    if (batch === Math.ceil(needed / 4)) break;
    const log = slots.find(stack => stack.id.endsWith('_log'))?.id ?? await harvestReachableLog(action, undefined, timberSite);
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
    assert.ok(await recoverPlacedFurnace(action, furnace), 'Could not pack the camp furnace after cooking');
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

async function clearFeedingObstruction(action, pos, owner, dog) {
  const [x, y, z] = feet(owner);
  if (y > pos[1] || y + 1 < pos[1] || pos[1] < Math.floor(dog.pos[1])
      || (x === pos[0] && z === pos[2]) || owner.threats?.some(threat => threat.distance < 6)) return false;
  const surroundings = await action('get_blocks', { center: pos, size: [3, 5, 3], format: 'json' });
  return Boolean(surroundings && !surroundings.stats?.unloadedChunks
    && !surroundings.cells.some(cell => /:(?:water|lava|gravel|sand|powder_snow|fire)$/.test(cell.b))
    && (await breakVisible(action, pos))?.broken);
}

export async function feedAdoptedDog(action, uuid, bed, attempts = 120) {
  const startingStock = await action('get_inventory');
  const offered = DOG_FOOD.find(item => count(startingStock, item));
  if (!offered) return false;
  if (startingStock.mainHand?.id !== offered) await hold(action, offered);
  const visited = [];
  const rejectedSteps = new Set();
  let clearedObstacles = 0;
  let previousDistance = Infinity;
  for (let attempt = 0; attempt < attempts; attempt++) {
    let player = await action('observe');
    if (!player || player.dead) return false;
    if (await retreatFromNearbyMob(action, player, visited, rejectedSteps)) continue;
    if (player.health < 8 || player.threats?.some(threat => threat.distance <= 3)) return false;
    const observed = await action('get_entities', { type: DOG, radius: FEEDING_SEARCH_RADIUS });
    const dog = observed?.entities.find(entity => entity.uuid === uuid && entity.health !== 0);
    if (dog?.distance <= 4.4) {
      const inventory = await action('get_inventory');
      const meal = DOG_FOOD.find(item => count(inventory, item));
      if (!meal) return false;
      const mealCount = count(inventory, meal);
      if (inventory.mainHand?.id !== meal) await hold(action, meal);
      const aimed = await aimAtEntity(action, dog.id);
      const hit = aimed?.crosshair;
      if (hit?.id === dog.id) {
        const fed = await action('interact_entity', { entityId: dog.id });
        await setTimeout(350);
        const remaining = count(await action('get_inventory'), meal);
        if (remaining === mealCount - 1) {
          if (fed?.success) return true;
          continue;
        }
        assert.equal(remaining, mealCount, 'A single feeding changed the raw meal count unexpectedly');
      } else if (hit?.pos && /(?:_leaves|:(?:vine|short_grass|tall_grass|fern|large_fern))$/.test(hit.block) && clearedObstacles < 6
          && !aimed.threats?.some(threat => threat.distance < 6)) {
        const [x, y, z] = hit.pos;
        const supports = ([px, py, pz]) => x === Math.floor(px) && y === Math.floor(py) - 1 && z === Math.floor(pz);
        if (!supports(dog.pos) && !supports(feet(aimed)) && (await breakVisible(action, hit.pos))?.broken) {
          clearedObstacles++;
          await hold(action, meal);
          continue;
        }
      }
      if (hit?.pos && FEEDING_OBSTRUCTION.test(hit.block) && aimed.onGround && !aimed.inWater
          && clearedObstacles < 6 && await clearFeedingObstruction(action, hit.pos, aimed, dog)) {
        clearedObstacles++;
        await hold(action, meal);
        continue;
      }
    }
    // Holding meat can interrupt barking at a peaceful mob. Let the dog
    // return on his own while the offer is fresh or he is coming closer.
    const returning = dog && offered !== 'minecraft:apple'
      && (attempt < 6 || dog.distance < previousDistance - 0.25);
    previousDistance = dog?.distance ?? Infinity;
    if (player && !returning && attempt % 2 === 1) {
      const tile = feet(player);
      const fromCamp = Math.hypot(tile[0] - bed[0], tile[1] - bed[1], tile[2] - bed[2]);
      visited.push(tile);
      const nearCamp = dog && Math.hypot(...dog.pos.map((axis, index) => axis - bed[index])) <= FEEDING_SEARCH_RADIUS;
      if (nearCamp && fromCamp < FEEDING_SEARCH_RADIUS) {
        const vertical = Math.abs(dog.pos[1] - player.position.y);
        const feedingDistance = 2.2;
        // An approach that is already within its stopping distance cannot change the sightline.
        if (dog.distance > feedingDistance && dog.distance <= 12 && vertical <= 1.25) {
          const approach = await action('go_to', { entityId: dog.id, stopDistance: feedingDistance, maxTicks: 45 });
          if (approach?.arrived && approach.ticks !== 0) continue;
          // A timeout can still move the player several blocks. Plan any
          // detour from there and let the next observation check for a meal.
          const after = await action('observe');
          if (!after?.inWorld || after.dead) return false;
          if (feet(after).join(',') !== tile.join(',')) continue;
          player = after;
          const obstruction = approach?.reason?.match(/blocked by (minecraft:\w+) at (-?\d+),(-?\d+),(-?\d+)/);
          if (obstruction && FEEDING_OBSTRUCTION.test(obstruction[1]) && clearedObstacles < 6) {
            const pos = obstruction.slice(2).map(Number);
            const distanceFromDog = Math.hypot(...pos.map((coordinate, axis) => coordinate + 0.5 - dog.pos[axis]));
            if (distanceFromDog > 2 && await clearFeedingObstruction(action, pos, player, dog)) {
              clearedObstacles++;
              await hold(action, offered);
              continue;
            }
          }
        }
        await stepOut(action, player, visited, dog.pos, vertical > 2 ? 'elevation' : undefined, rejectedSteps);
      } else if (fromCamp > 3) {
        await stepOut(action, player, visited, bed, false, rejectedSteps);
      }
    }
    await setTimeout(550);
  }
  return false;
}

async function seekExpeditionFood(action, player, visited, rejectedSteps, tried, toward, sighting) {
  const nearby = await action('get_entities', { radius: 32, max: 96 });
  const drop = nearby?.entities.find(entity => entity.item?.id && DOG_FOOD.includes(entity.item.id)
    && !tried.has(entity.id) && entity.distance < 12 && Math.abs(entity.pos[1] - player.position.y) < 3);
  if (drop) {
    tried.add(drop.id);
    if ((await action('go_to', { entityId: drop.id, stopDistance: 0.3, maxTicks: 50 }))?.arrived) return;
  }
  const hostiles = (nearby?.entities ?? []).filter(entity => entity.hostile);
  const safeAround = position => !hostiles.some(threat => Math.hypot(...threat.pos.map((axis, index) =>
    axis - position[index])) < 8);
  const heightGap = animal => animal.pos[1] - player.position.y;
  const reachableAnimal = entities => entities?.filter(entity =>
    (BACKUP_MEAT[entity.type] || entity.type === 'minecraft:sheep') && !tried.has(entity.id)
    && heightGap(entity) >= -22 && heightGap(entity) <= 9 && safeAround(entity.pos))
    .sort((a, b) => a.distance - b.distance + 2 * (Math.abs(heightGap(a)) - Math.abs(heightGap(b))))[0];
  let animal = reachableAnimal(nearby?.entities);
  if (!animal && !toward && (sighting || visited.length % 4 === 0)) {
    const scouting = await action('get_entities', { radius: 64, max: 128 });
    animal = reachableAnimal(scouting?.entities);
  }
  if (animal?.distance <= 6 && Math.abs(animal.pos[1] - player.position.y) < 3) {
    tried.add(animal.id);
    await hunt(action, animal, item => item === (BACKUP_MEAT[animal.type] ?? MUTTON));
  } else {
    // Keep steering toward a distant observation between scans. A stale sighting can
    // guide movement but cannot authorize an attack.
    const remembered = sighting?.stepsLeft > 0 && safeAround(sighting.pos) ? sighting : undefined;
    const destination = animal?.pos ?? remembered?.pos ?? toward;
    visited.push(feet(player));
    let ground = destination ? 'surface' : player.position.y >= 96 ? 'downhill' : 'grass';
    if (destination && Math.abs(destination[1] - player.position.y) > 2) ground = 'elevation';
    if (await stepOut(action, player, visited, destination, ground, rejectedSteps)) {
      if (animal) return { pos: animal.pos, stepsLeft: 5 };
      if (remembered?.stepsLeft > 1) return { ...remembered, stepsLeft: remembered.stepsLeft - 1 };
    }
  }
}

export async function forageExpeditionMeal(action, { camp, toward, minimum = 1, regroup } = {}) {
  const visited = [];
  const rejectedSteps = new Set();
  const tried = new Set();
  let returning = Boolean(camp);
  let searchToward = toward;
  let sighting;
  for (let attempt = 0; attempt < (camp || toward ? 48 : 28); attempt++) {
    const inventory = await action('get_inventory');
    if (dogMealCount(inventory) >= minimum) return true;
    const player = await action('observe');
    if (!player?.inWorld || player.dead || player.health < 8) return false;
    if (await retreatFromNearbyMob(action, player, visited, rejectedSteps)) continue;
    if (player.health < 12 && player.threats?.some(threat => threat.distance <= 3)) return false;
    if (await regroup?.(player)) continue;
    if (returning) {
      const here = feet(player);
      returning = Math.hypot(...here.map((coordinate, axis) => coordinate - camp[axis])) > 6;
      if (returning) {
        visited.push(here);
        await stepOut(action, player, visited, camp, 'surface', rejectedSteps);
        continue;
      }
    }
    if (searchToward && Math.hypot(searchToward[0] - player.position.x, searchToward[2] - player.position.z) <= 8) {
      searchToward = undefined;
    }
    sighting = await seekExpeditionFood(action, player, visited, rejectedSteps, tried, searchToward, sighting);
  }
  return false;
}

export async function prepareAdoptionCamp(action, craft, descendFromCanopy,
  { chooseRoute, reportScouting, timberSite, observedTrail } = {}) {
  const bedding = await gatherWool(action, descendFromCanopy, chooseRoute, craft, reportScouting, observedTrail);
  if (typeof bedding !== 'string') {
    return { bed: bedding.bed, door: bedding.door, entrance: bedding.entrance };
  }
  await ensurePlanks(action, craft, 3, timberSite);
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

async function selectBreakingTool(action, block) {
  const kind = DIGGABLE.test(block) ? 'shovel' : MINEABLE.test(block) ? 'pickaxe' : CHOPPABLE.test(block) ? 'axe' : null;
  if (!kind && block !== 'minecraft:leaf_litter') return true;
  const stock = await action('get_inventory');
  const tiers = block.endsWith('iron_ore') ? TOOL_TIERS.slice(0, -1) : TOOL_TIERS;
  const tool = kind && tiers.map(tier => `minecraft:${tier}_${kind}`)
    .find(id => stock.slots.some(stack => stack.id === id && durability(stack) > 0));
  if (tool) {
    if (stock.mainHand?.id !== tool) await hold(action, tool);
    return true;
  }
  if (kind === 'pickaxe') return false;
  // A hand can break these blocks if the matching tool is unavailable.
  if (!stock.mainHand?.maxDamage) return true;
  const empty = Array.from({ length: 9 }, (_, slot) => slot).find(slot => !stock.slots.some(stack => stack.slot === slot));
  const spare = stock.slots.find(stack => stack.slot < 9 && !stack.maxDamage)?.slot;
  const slot = empty ?? spare;
  if (slot === undefined) return false;
  return Boolean(await action('select_slot', { slot }));
}

export async function breakVisible(action, pos, aim = { at: pos }) {
  await action('look', aim);
  await setTimeout(80);
  const hit = (await action('observe'))?.crosshair;
  if (hit?.pos?.join(',') !== pos.join(',') || !await selectBreakingTool(action, hit.block)) return null;
  return action('break_block', { pos, maxTicks: 115 });
}

export async function recoverPlacedFurnace(action, furnace) {
  const before = count(await action('get_inventory'), FURNACE);
  if (!(await breakVisible(action, furnace))?.broken) {
    const hit = (await action('observe'))?.crosshair;
    if (!hit?.pos || !/^minecraft:(?:short_grass|tall_grass|fern|large_fern)$/.test(hit.block ?? '')
        || !(await breakVisible(action, hit.pos))?.broken || !(await breakVisible(action, furnace))?.broken) return false;
  }
  await action('go_to', { pos: furnace, stopDistance: 0.3, maxTicks: 55 });
  await setTimeout(350);
  return count(await action('get_inventory'), FURNACE) > before;
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

export async function settleOnDryStep(action, landing, wait = setTimeout, confirmStopped = false, minimumHealth = 8) {
  const target = landing.join(',');
  let previous;
  for (let attempt = 0; attempt < (confirmStopped ? 14 : 8); attempt++) {
    const player = await action('observe');
    if (!player?.inWorld || player.dead || player.health < minimumHealth || player.inWater) return false;
    if (player.onGround && feet(player).join(',') === target) {
      const { x, z } = player.position;
      if (!confirmStopped || (previous && Math.hypot(x - previous.x, z - previous.z) < 0.025)) return true;
      previous = player.position;
    } else if (previous && player.onGround) {
      // A first grounded sample can still have enough momentum to leave the stair.
      return false;
    } else {
      previous = undefined;
    }
    // Extend the wait only for a player already supported in the verified
    // destination column. A drift out of it still invalidates the landing.
    if (attempt >= 7 && !previous) return false;
    if (attempt === 3 && player.onGround && Math.abs(player.position.y - landing[1] - 1) < 0.05) {
      const dx = landing[0] + 0.5 - player.position.x;
      const dz = landing[2] + 0.5 - player.position.z;
      // The walker's stopping radius can leave part of the player's body
      // supported by the old ledge. Walk into the verified opening.
      if (Math.hypot(dx, dz) <= 0.45) {
        await action('move', { forward: true, yaw: Math.atan2(-dx, dz) * 180 / Math.PI, ticks: confirmStopped ? 1 : 2 });
      }
    }
    await wait(125);
  }
  return false;
}

export async function reachQuarryLanding(action, landing, drop = 1, masonry = false) {
  const outcome = await action('go_to', { pos: landing, stopDistance: 0.3, maxTicks: 45 });
  if (outcome?.arrived) return settleOnDryStep(action, landing, setTimeout, true);
  if (!outcome?.reason?.includes('drop of more than 3 blocks')) return false;

  const player = await action('observe');
  return nudgeOntoDryQuarryTile(action, player, landing, drop, masonry);
}

async function nudgeOntoDryQuarryTile(action, player, landing, heightDifference, masonry = false) {
  if (!player?.inWorld || !player.onGround || player.dead || player.inWater || player.health < 8
      || Math.abs(player.position.y - landing[1] - heightDifference) > 0.05) return false;
  const dx = landing[0] + 0.5 - player.position.x;
  const dz = landing[2] + 0.5 - player.position.z;
  if (Math.hypot(dx, dz) > 0.45) return false;

  // The native lookahead can include the next column beyond this stair.
  // Recheck the actual landing before moving the last fraction of a block.
  const view = await action('get_blocks', { center: landing, size: [3, 5, 3], format: 'json' });
  if (!view || !quarryLandingIsClear(view.cells, landing, masonry)) return false;
  await action('move', { forward: true, yaw: Math.atan2(-dx, dz) * 180 / Math.PI, ticks: 1 });
  return settleOnDryStep(action, landing, setTimeout, true);
}

export async function descendQuarry(action, player, bed, stairs, protectedGround, route) {
  const start = feet(player);
  const { cells } = await action('get_blocks', { center: start, size: [7, route?.masonry ? 9 : 7, 7], format: 'json' });
  if (!player.onGround || (!route?.masonry && !cells.some(({ x, y, z, b }) =>
    x === start[0] && y === start[1] - 1 && z === start[2] && hasDrySupport(b)))) return 'unavailable';
  const step = quarryStep(cells, start, bed, stairs, route);
  if (!step) return 'unavailable';
  route?.rejected?.add(String(step.landing));
  const [tx, ty, tz] = step.landing;
  const overhang = [tx, ty + 2, tz];
  let opened = false;
  for (const pos of step.clear) {
    let result = await breakVisible(action, pos);
    if (!result && await settleOnDryStep(action, start)) {
      const hit = (await action('observe'))?.crosshair;
      if (hit?.block === 'minecraft:leaf_litter' && String(hit.pos) === String(overhang)) {
        // The ray to the solid face can hit litter that a center aim missed.
        const cover = await action('break_block', { pos: overhang, maxTicks: 25 });
        opened ||= Boolean(cover?.broken);
      }
      result = await breakVisible(action, pos);
    }
    if (/took damage from (?:lava|.*fire)/i.test(result?.reason ?? '')) {
      await moveAwayFromFire(action, cells.filter(({ b }) => /:(?:lava|fire|soul_fire)$/.test(b)));
      return 'blocked';
    }
    if (!result?.broken) return opened ? 'blocked' : 'unavailable';
    opened = true;
  }
  if (!await reachQuarryLanding(action, step.landing, start[1] - ty, route?.masonry)) return 'blocked';
  const [x, y, z] = start;
  for (const support of [[x, y - 1, z], [tx, ty - 1, tz]]) protectedGround.add(support.join(','));
  stairs.push(start);
  return step.landing;
}

async function rebuildQuarryExit(action, player, pos) {
  const volume = await action('get_blocks', { center: pos, size: [5, 7, 5], format: 'json' });
  if (!volume || volume.stats?.unloadedChunks || !missingQuarryExitSupport(volume.cells, pos)) return false;
  const stock = await action('get_inventory');
  const here = feet(player);
  const [x, y, z] = pos;
  const exits = [pos, [x + 1, y, z], [x - 1, y, z], [x, y, z + 1], [x, y, z - 1]];
  for (const exit of exits) {
    const repair = missingQuarryExitSupport(volume.cells, exit);
    if (!repair) continue;
    const material = ['minecraft:dirt', COBBLESTONE].find(id => count(stock, id) >= repair.blocksToPlace.length);
    if (!material) continue;
    const approaches = repair.stances.sort((a, b) =>
      Math.hypot(...a.map((n, i) => n - here[i])) - Math.hypot(...b.map((n, i) => n - here[i])));
    let found = false;
    for (const stance of approaches) {
      const move = await action('go_to', { pos: stance, stopDistance: 0.3, maxTicks: 40 });
      if (move?.arrived && await settleOnDryStep(action, stance, setTimeout, true)) {
        found = true;
        break;
      }
    }
    if (!found) continue;
    await hold(action, material);
    let supported = true;
    for (const block of repair.blocksToPlace) {
      const placed = await action('place_block', { pos: block });
      if (placed?.blockAtPos === material) continue;
      // A companion can occupy the lower cell. Keep that tile clear and
      // find a neighboring stair with a solid foundation.
      supported = false;
      break;
    }
    if (!supported) continue;
    const walk = await action('go_to', { pos: exit, stopDistance: 0.3, maxTicks: 40 });
    if (walk?.arrived && await settleOnDryStep(action, exit)) return true;
  }
  return false;
}

export async function climbQuarry(action, pos, chooseEscape) {
  const visited = [];
  const rejectedSteps = new Set();
  for (let attempt = 0; attempt < 8; attempt++) {
    const result = await action('go_to', { pos, stopDistance: 0.3, maxTicks: 35 });
    if (result?.arrived && await settleOnDryStep(action, pos)) return true;
    const player = await action('observe');
    if (!player?.inWorld || player.dead || player.health < 8) return false;
    if (attempt < 2 && result?.arrived && player.position.y < pos[1]
        && await rebuildQuarryExit(action, player, pos)) return true;
    if (result?.reason?.includes('drop of more than 3 blocks')
        && await nudgeOntoDryQuarryTile(action, player, pos, 0)) return true;
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
  const route = [...stairs, landing];
  for (let index = 0; index < stairs.length; index++) {
    const player = await action('observe');
    if (!player?.onGround || player.health < 14) break;
    const here = feet(player);
    const tile = route[index + 1];
    const { cells, stats } = await action('get_blocks', { center: here, size: [5, 7, 5], format: 'json' });
    const reachable = (from, to) => String(dryWaypoint(cells, from, [], to)) === String(to);
    if (stats?.unloadedChunks || String(here) !== String(route[index]) || !reachable(here, tile)) break;
    if (await reachQuarryLanding(action, tile, here[1] - tile[1])) {
      retraced.push(here);
      continue;
    }
    // A walk can settle one stair farther downhill. Keep the marked route only
    // when the extra stair is still walkable and the player has stopped on it.
    const next = route[index + 2];
    if (next && reachable(tile, next) && await settleOnDryStep(action, next, setTimeout, true, 14)) {
      retraced.push(here, tile);
      index++;
      continue;
    }
    const stopped = await action('observe');
    if (!stopped?.onGround || stopped.inWater || stopped.health < 14) break;
    const [x, y, z] = feet(stopped);
    // Momentum can also carry the player onto neighboring solid ground at
    // the same level. Walk back onto the marked stair if both tiles fit.
    if (y !== tile[1] || Math.abs(x - tile[0]) + Math.abs(z - tile[2]) !== 1
        || !reachable([x, y, z], tile) || !await reachQuarryLanding(action, tile, 0)) break;
    retraced.push(here);
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

async function takeCover(action, threats = []) {
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
    await stepOut(action, position, visited, cover, undefined, rejected, undefined, threats.length ? threats : undefined);
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

async function sleepInField(action, player, bed) {
  if (!isBedtime(player) || !player.onGround || player.health < 14
      || player.threats?.some(threat => threat.distance < 11)
      || !careReturnNeedsCover(player, bed)) return false;
  const { slots } = await action('get_inventory');
  const carried = slots.find(stack => /^minecraft:\w+_bed$/.test(stack.id));
  if (!carried) return false;
  const landing = await placeBeside(action, carried.id).catch(error => {
    if (error.message.startsWith('No nearby supported position for ')) return null;
    throw error;
  });
  return Boolean(landing && await sleepNearby(action, await action('observe')));
}

export async function waitForDaylightRecovery(action, bed, report, protectCompanion) {
  const visited = [];
  const rejected = new Set();
  let nextShelter = 0;
  let nextSleep = 0;
  // The Mac client can advance the integrated server at about ten ticks per
  // second under load. Allow a whole night at that rate when there is no bed.
  for (let check = 0; check < 500; check++) {
    const player = await action('observe');
    assert.ok(player?.inWorld && !player.dead, 'The player did not survive the night before the reunion');
    if (await protectCompanion?.(player)) continue;
    if (player.timeOfDay < 12_000) return;
    if (player.gameTime >= nextSleep) {
      nextSleep = player.gameTime + 70;
      if (await sleepNearby(action, player) || await sleepInField(action, player, bed)) {
        await report('Slept until daylight before looking for Mushroom.');
        return;
      }
    }
    if (player.gameTime >= nextShelter) {
      nextShelter = player.gameTime + 160;
      const nearby = await action('get_entities', { radius: 12, max: 64 });
      const hazards = nearby?.entities.filter(entity => entity.hostile).map(entity => entity.pos) ?? [];
      if (await takeCover(action, hazards)) {
        await report('Found cover while waiting for a daylight route to Mushroom.');
        continue;
      }
    }
    if (await retreatFromNearbyMob(action, player, visited, rejected, 7, 16, 16)) continue;
    await setTimeout(2_500);
  }
  throw new Error('Could not reach daylight safely before the reunion');
}

export async function shelterUnderRangedFire(action, player) {
  if (!player.onGround || player.inWater) return false;
  const here = feet(player);
  const volume = await action('get_blocks', { center: here, size: [9, 11, 9], format: 'json' });
  const plan = volume && !volume.stats?.unloadedChunks && planEmergencyDugout(volume.cells, here);
  if (!plan) return false;
  const stock = await action('get_inventory');
  const material = [COBBLESTONE, 'minecraft:dirt'].find(item => count(stock, item) > 0);
  if (!material) return false;

  const [x, , z] = here;
  let aligned = player;
  for (let adjustment = 0; ; adjustment++) {
    if (!aligned?.inWorld || aligned.dead || aligned.health < player.health || String(feet(aligned)) !== String(here)) return false;
    const dx = x + 0.5 - aligned.position.x;
    const dz = z + 0.5 - aligned.position.z;
    if (Math.max(Math.abs(dx), Math.abs(dz)) <= 0.15) break;
    if (adjustment >= 4) return false;
    await action('move', { yaw: Math.atan2(-dx, dz) * 180 / Math.PI, forward: true, ticks: 2 });
    aligned = await action('observe');
  }
  const settle = landing => settleOnDryStep(action, landing, setTimeout, false, player.health);
  for (const block of plan.dig) {
    assert.ok((await breakVisible(action, block))?.broken && await settle(block),
      'Could not reach verified footing in the emergency dugout');
  }
  await hold(action, material);
  assert.equal((await action('place_block', { pos: plan.cap }))?.blockAtPos, material,
    'Could not close the top of the emergency dugout');
  let safeToLeave = false;
  for (let check = 0; check < 600; check++) {
    const hidden = await action('observe');
    assert.ok(hidden?.inWorld && !hidden.dead && hidden.health >= player.health
      && String(feet(hidden)) === String(plan.floor), 'The dugout did not keep the player safe');
    if (hidden.timeOfDay < 12_000 && !hidden.threats?.some(threat => threat.distance <= 16)) {
      safeToLeave = true;
      break;
    }
    await setTimeout(2_500);
  }
  assert.ok(safeToLeave, 'The emergency dugout exit stayed unsafe through daylight');
  assert.ok((await breakVisible(action, plan.cap))?.broken, 'Could not reopen the emergency dugout');
  for (const { landing, clear } of plan.exit) {
    for (const block of clear) {
      assert.ok((await breakVisible(action, block))?.broken, 'Could not clear the emergency exit stair');
    }
    const moved = await action('go_to', { pos: landing, stopDistance: 0.3, maxTicks: 35 });
    assert.ok(moved?.arrived && await settle(landing), 'Could not climb the emergency exit stair');
  }
  return true;
}

export async function regroupExpeditionCompanion(action, uuid, lastPosition, trail = []) {
  const distanceFrom = (first, second) => Math.hypot(...first.map((value, axis) => value - second[axis]));
  const visited = [];
  const rejected = new Set();
  const rejectedClimbs = new Set();
  let waypointIndex;
  let blocked = 0;
  let heldShieldTicks = 0;
  for (let approach = 0; approach < 36;) {
    const player = await action('observe');
    assert.ok(player?.inWorld && !player.dead && player.health > 0, 'The player did not survive regrouping');
    const dogs = await action('get_entities', { type: DOG, radius: 128 });
    const dog = dogs?.entities.find(entity => entity.uuid === uuid && entity.health > 0);
    if (dog?.distance <= 6 && Math.abs(dog.pos[1] - player.position.y) <= 3) return dog;
    const archer = player.threats?.find(threat => threat.distance <= 18
      && /:(?:skeleton|stray|bogged|parched)$/.test(threat.type));
    if (player.health <= 5 && archer && await shelterUnderRangedFire(action, player)) continue;
    if (player.health < 12 && archer && !player.threats.some(threat => threat.distance < 6)) {
      const shieldPulse = 96;
      assert.ok(heldShieldTicks + shieldPulse <= 6_000, 'The archer kept the regroup route under fire');
      const inventory = await action('get_inventory');
      const usableShield = inventory?.slots.some(stack => stack.slot === 40 && stack.id === SHIELD && durability(stack) > 0);
      const freeUseSlot = Array.from({ length: 9 }, (_, slot) => slot).find(slot =>
        !inventory?.slots.some(stack => stack.slot === slot && !/_(?:sword|pickaxe|shovel|axe|hoe)$/.test(stack.id)));
      if (usableShield && freeUseSlot !== undefined) {
        if (inventory.selectedSlot !== freeUseSlot) await action('select_slot', { slot: freeUseSlot });
        assert.ok(await action('look', { entityId: archer.id }), 'Could not face the archer before raising the shield');
        const blockedShot = await action('use_item', { ticks: shieldPulse });
        assert.ok(blockedShot?.completed && blockedShot.health >= player.health, 'The shield did not keep the player safe during regrouping');
        heldShieldTicks += shieldPulse;
        continue;
      }
    }
    assert.ok(player.health >= 8 || !player.threats?.some(threat => threat.distance <= 18),
      'The player became unsafe during regrouping');
    approach++;
    lastPosition = dog?.pos ?? lastPosition;
    assert.ok(lastPosition, 'The original Mushroom is out of sight and has no recorded position');
    const here = feet(player);
    if (waypointIndex === undefined) {
      const closest = trail.map((point, index) => ({ index, distance: distanceFrom(here, point) }))
        .filter(waypoint => waypoint.distance <= 12 && Math.abs(here[1] - trail[waypoint.index][1]) <= 3)
        .sort((first, second) => (first.distance + first.index * 0.3) - (second.distance + second.index * 0.3))[0];
      waypointIndex = closest && distanceFrom(lastPosition, trail[0]) <= 8 ? closest.index : -1;
    }
    while (waypointIndex >= 0 && distanceFrom(here, trail[waypointIndex]) <= 1.5) waypointIndex--;
    const pacedApproach = waypointIndex >= 0
      && player.threats?.some(entity => entity.type === 'minecraft:creeper' && entity.distance <= 16);
    if (await retreatFromNearbyMob(action, player, visited, rejected, 7, pacedApproach ? 8 : 16)) continue;
    const target = trail[waypointIndex] ?? lastPosition;
    const nearby = Math.hypot(here[0] - target[0], here[2] - target[2]) <= 8;
    const uphill = nearby && target[1] - here[1] >= 2;
    const ground = uphill ? 'uphill' : waypointIndex >= 0 || nearby ? 'elevation' : 'surface';
    visited.push(here);
    const walked = await stepOut(action, player, visited, target, ground, rejected, undefined, undefined, pacedApproach ? 12 : 90);
    // The foothold below the companion must stay intact while cutting a way up.
    const stopped = !walked && uphill && !pacedApproach ? await action('observe') : undefined;
    const cut = stopped?.inWorld && !stopped.dead && lastPosition[1] - Math.floor(stopped.position.y) >= 4
      && await cutScoutingFoothold(action, stopped, { anchor: target, rejectedClimbs, allowCeiling: true });
    if (walked || cut) {
      blocked = 0;
    } else if (++blocked >= 4) {
      if (waypointIndex < 0) break;
      waypointIndex = -1;
      blocked = 0;
    }
  }
  throw new Error('Could not reach the last known position of the original Mushroom');
}

export async function daylightLoadoutIsVisible(action, player, destination) {
  if (!player?.onGround || player.inWater || player.health < 16 || player.food < 16
      || !Number.isFinite(player.timeOfDay) || player.timeOfDay > 9_000
      || player.threats?.some(threat => threat.distance <= 14)) return false;
  const view = await action('get_entities', { type: 'minecraft:item', radius: 96, max: 96 });
  const nearDeath = view?.entities.filter(drop => drop.item && drop.pos
    && Math.hypot(...drop.pos.map((coordinate, axis) => coordinate - destination[axis])) <= 8) ?? [];
  return [SHIELD, FIELD_GUIDE].every(item => nearDeath.some(drop => drop.item.id === item));
}

export async function recoverDroppedLoadout(action, destination,
    { reserveMeal = false, companionUuid, direct = false, onCompanionFed } = {}) {
  const visited = [];
  const rejectedSteps = new Set();
  let stalled = 0;
  let detours = 0;
  let healingChecks = 0;
  let blockedRetreats = 0;
  let nextCompanionCheck = 0;
  for (let attempt = 0; attempt < 100; attempt++) {
    const player = await action('observe');
    assert.ok(player?.inWorld && !player.dead, 'The return to the dropped gear became unsafe');
    if (await retreatFromNearbyMob(action, player, visited, rejectedSteps, 14)) {
      blockedRetreats = 0;
      continue;
    }
    if (player.threats?.some(threat => threat.distance <= 10 && threat.type !== 'minecraft:enderman')) {
      if (++blockedRetreats >= 4) break;
      continue;
    }
    blockedRetreats = 0;
    if (player.health < 10 && player.food >= 18 && player.onGround
        && !player.threats?.some(threat => threat.distance <= 10) && healingChecks++ < 30) {
      await setTimeout(400);
      continue;
    }
    assert.ok(player.health >= 10, 'The return to the dropped gear became unsafe');
    if (attempt === 0 && await sleepNearby(action, player)) continue;
    if (reserveMeal && companionUuid && player.gameTime >= nextCompanionCheck) {
      nextCompanionCheck = player.gameTime + 80;
      const view = await action('get_entities', { type: DOG, radius: FEEDING_SEARCH_RADIUS });
      const dog = view?.entities.find(entity => entity.uuid === companionUuid && entity.health > 0 && entity.health <= 8
        && entity.distance <= 10);
      if (dog && await feedAdoptedDog(action, companionUuid, feet(player), 12)) {
        await onCompanionFed?.();
        continue;
      }
    }
    if (reserveMeal && player.food <= 16 && player.health < 18) {
      const stock = await action('get_inventory');
      const meal = DOG_FOOD.find(item => count(stock, item));
      if (meal && dogMealCount(stock) > 1 && await eatExpeditionMeal(action, player, meal)) continue;
    }
    const here = feet(player);
    if (Math.hypot(...destination.map((coordinate, axis) => coordinate - here[axis])) <= 5) {
      const { entities } = await action('get_entities', { type: 'item', radius: 8 });
      // Walk to the guide first so the next controller can recognize the returning owner.
      const guide = entities.find(entity => entity.item?.id === FIELD_GUIDE);
      for (const drop of [guide, ...entities.filter(entity => entity !== guide)].filter(Boolean)) {
        if (Math.abs(drop.pos[1] - player.position.y) > 1.5) continue;
        await action('go_to', { entityId: drop.id, stopDistance: 0.25, maxTicks: 40 });
      }
      const stock = await action('get_inventory');
      if (direct && count(stock, SHIELD)) {
        if (!stock.slots.some(stack => stack.id === SHIELD && stack.slot === 40)) await equipExpeditionShield(action);
        if (count(stock, FIELD_GUIDE)) return 'guide';
      } else if (!direct && count(stock, FIELD_GUIDE)) {
        return 'guide';
      }
      if (!direct && companionUuid && count(stock, STONE_PICKAXE) && count(stock, FURNACE)) {
        const dogs = await action('get_entities', { type: DOG, radius: FEEDING_SEARCH_RADIUS });
        if (dogs?.entities.some(dog => dog.uuid === companionUuid && dog.health > 0)) return 'companion';
      }
    }
    visited.push(here);
    const recent = new Set(visited.slice(-16).map(([x, , z]) => `${x},${z}`));
    if (visited.length >= 16 && recent.size <= 4) {
      if (++detours > 2) break;
      await stepOut(action, player, visited, undefined, undefined, rejectedSteps);
      visited.splice(0, visited.length - 4);
      continue;
    }
    stalled = await stepOut(action, player, visited, destination, direct ? 'surface' : false, rejectedSteps) ? 0 : stalled + 1;
    if (stalled >= 3) break;
  }
  await takeCover(action);
  throw new Error('Could not verify the original expedition after returning to the dropped gear');
}

async function equipExpeditionShield(action) {
  const menu = await action('get_container');
  const shield = menu?.slots.find(stack => stack.section === 'player' && stack.id === SHIELD);
  assert.ok(shield, 'Could not find the shield in the player inventory');
  await action('click_slot', { slot: shield.slot, action: 'swap', hotbar: 40 });
  assert.ok((await action('get_inventory')).slots.some(stack => stack.id === SHIELD && stack.slot === 40),
    'The shield did not move to the offhand');
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
      const descent = stairs.length < 14
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

export async function quarryFooting(action, pos) {
  const view = await action('get_blocks', { center: pos, size: [7, 7, 7], format: 'json' });
  if (!view || view.stats?.unloadedChunks) return null;
  return createHash('sha256').update(JSON.stringify(view.cells.map(({ x, y, z, b }) => [x, y, z, b].join(',')).sort()))
    .digest('hex');
}

export async function repeatedQuarryEntrance(action, here, attempts) {
  for (const { entrance, blockedAt, footing } of attempts) {
    if (Math.abs(here[1] - entrance[1]) <= 2
        && Math.hypot(here[0] - entrance[0], here[2] - entrance[2]) <= 4
        && await quarryFooting(action, blockedAt) === footing) return true;
  }
  return false;
}

export async function earnIronKit(action, craft, { bed }, policy = {}) {
  const stairs = [];
  const protectedGround = new Set();
  let quarryLanding;
  const reopenQuarry = async (route, landing) => {
    const retraced = await reenterQuarry(action, route, landing);
    const nextLanding = route[retraced.length] ?? landing;
    if (retraced.length && String(feet(await action('observe'))) === String(nextLanding)) {
      stairs.push(...retraced);
      quarryLanding = nextLanding;
    } else {
      await leaveQuarry(action, retraced, policy);
      quarryLanding = undefined;
    }
    if (quarryLanding) {
      for (const [x, y, z] of [...stairs, quarryLanding]) protectedGround.add(`${x},${y - 1},${z}`);
    }
    await policy.saveQuarry?.(stairs, quarryLanding);
  };
  if (policy.resumeQuarry?.length) {
    const player = await action('observe');
    const landing = policy.resumeQuarryLanding;
    if (landing && player?.onGround && player.health >= 14 && feet(player).join(',') === landing.join(',')) {
      stairs.push(...policy.resumeQuarry);
      quarryLanding = landing;
      for (const [x, y, z] of [...stairs, landing]) protectedGround.add(`${x},${y - 1},${z}`);
    } else if (policy.reenterQuarry && landing) {
      await reopenQuarry(policy.resumeQuarry, landing);
    } else {
      await leaveQuarry(action, policy.resumeQuarry, policy);
      await policy.saveQuarry?.([]);
    }
  }
  if (policy.returningAfterCare) {
    await leaveQuarry(action, stairs, policy);
    stairs.length = 0;
    await policy.saveQuarry?.([]);
    await policy.returnAfterCare();
  }
  const startingStock = await action('get_inventory');
  const resumedWithIron = stairs.length > 0
    && (count(startingStock, IRON_INGOT) > 0 || count(startingStock, RAW_IRON) > 0);
  let plan = ironKitPlan(startingStock, policy);
  if (!plan.recipes.length && !plan.requiredOre) {
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
  let nextMealAttempt = 0;
  let nextCompanionCheck = 0;
  let blockedCaveSteps = 0;
  let highlandSearch = 0;
  let movingToFreshGround = policy.scoutNewGround ? 8 : 0;
  const triedFoodSources = new Set();
  let exhaustedQuarries = policy.exhaustedQuarries ?? [];
  let bringFirstIronHome = policy.bringFirstIronHome;
  for (let attempt = 0; attempt < 190; attempt++) {
    const inventory = await action('get_inventory');
    if (bringFirstIronHome && count(inventory, RAW_IRON)) {
      await leaveQuarry(action, stairs, policy);
      stairs.length = 0;
      await policy.saveQuarry?.([]);
      await bringFirstIronHome();
      bringFirstIronHome = undefined;
      continue;
    }
    const wanted = new Set();
    const { requiredOre } = plan;
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
    if (!stairs.length && await retreatFromNearbyMob(action, player, visited, rejectedSteps)) continue;
    if (!stairs.length && isBedtime(player) && player.gameTime >= nextSleepCheck) {
      nextSleepCheck = player.gameTime + 300;
      if (await sleepNearby(action, player)) continue;
      if (await sleepInField(action, player, bed)) {
        await policy.reportScouting?.('Slept in a carried bed so the player and Mushroom can travel in daylight.');
        continue;
      }
    }
    if (policy.checkCompanion && player.gameTime >= nextCompanionCheck) {
      nextCompanionCheck = player.gameTime + 40;
      const dogStatus = await policy.checkCompanion(player, !stairs.length);
      if (dogStatus === 'regrouped') continue;
      if (dogStatus === 'care') {
        const paused = stairs.length && quarryLanding ? { stairs: [...stairs], landing: quarryLanding } : undefined;
        if (stairs.length) {
          await leaveQuarry(action, stairs, policy);
          stairs.length = 0;
          await policy.saveQuarry?.([]);
        }
        if (await policy.tendCompanion()) {
          await policy.returnAfterCare();
        } else if (paused) {
          await policy.reportScouting?.('Mushroom ate and it is safe to continue. Returning to the known quarry stairs.');
          await policy.saveQuarry?.(paused.stairs, paused.landing, true);
          await reopenQuarry(paused.stairs, paused.landing);
        }
        continue;
      }
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
    let meal;
    if (policy.reserveCompanionMeal) {
      meal = spareExpeditionMeal(inventory);
    } else {
      meal = [...COOKED_FOOD, ...BACKUP_FOOD].find(item => count(inventory, item));
      if (!meal && count(inventory, MUTTON) > (player.health < 14 || player.food <= 12 ? 0 : 1)) meal = MUTTON;
    }
    if (player.food < 20 && (player.food <= 16 || player.health < 14) && meal && player.gameTime >= nextMealAttempt) {
      if (await eatExpeditionMeal(action, player, meal)) continue;
      nextMealAttempt = player.gameTime + 100;
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
    const shield = plan.recipes.find(([item]) => item === SHIELD);
    if (shield && (!stairs.length || resumedWithIron || misses >= 6)
        && player.onGround && !player.inWater && player.health >= 14
        && !player.threats?.some(threat => threat.distance <= 8)
        && (count(inventory, IRON_INGOT) || count(inventory, RAW_IRON))) {
      if (stairs.length) {
        await leaveQuarry(action, stairs, policy);
        stairs.length = 0;
        await policy.saveQuarry?.([]);
        continue;
      }
      await craftIronKit(action, craft, [shield], Math.min(requiredOre, count(inventory, RAW_IRON)),
        inventory, visited, true);
      plan = ironKitPlan(await action('get_inventory'), policy);
      misses = 0;
      continue;
    }
    if (usable) {
      const before = mined.size;
      const collected = await mineVisible(action, bed, mined, wanted, drops, protectedGround);
      if (collected || (stairs.length && mined.size > before)) {
        // A broken ore block can open a route to its drop on the next scan.
        misses = 0;
        continue;
      }
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
    const scoutDownhill = !stairs.length && player.position.y >= 88 && highlandSearch < 48
      && (exhaustedQuarries.length > 0 || policy.scoutNewGround);
    if (scoutDownhill && highlandSearch === 0) {
      await policy.reportScouting?.('Several high quarries ran out of reachable ore. Looking for a dry route downhill.');
    }
    const fallback = misses >= 12 ? 'quarry' : 'scout';
    const work = movingToFreshGround || scoutDownhill ? 'scout' : policy.chooseWork && misses >= 8 && !stairs.length
      ? await policy.chooseWork(player, { material: 'iron', missedStone: misses,
        rawIron: count(inventory, RAW_IRON), needed: requiredOre, hasCoal: count(inventory, COAL) > 0 }, fallback)
      : fallback;
    let openedBlockedQuarry = false;
    const here = feet(player);
    const rejectedEntrance = !stairs.length && work === 'quarry'
      && await repeatedQuarryEntrance(action, here, exhaustedQuarries);
    if (rejectedEntrance) {
      movingToFreshGround = 8;
      misses = 0;
      await policy.reportScouting?.('The previous quarry footing is unchanged. Looking for a different opening.');
    }
    if (!rejectedEntrance && usable && stairs.length < 44 && player.position.y > 20 && (stairs.length || work === 'quarry')) {
      const opening = stairs.length === 0;
      const descent = await descendQuarry(action, player, bed, stairs, protectedGround);
      if (Array.isArray(descent)) {
        if (opening) await policy.reportScouting?.('Started a supported staircase after scouting for exposed iron.');
        quarryLanding = descent;
        await policy.saveQuarry?.(stairs, quarryLanding);
        continue;
      }
      openedBlockedQuarry = descent === 'blocked';
    }
    if (stairs.length || openedBlockedQuarry) {
      const entrance = stairs[0] ?? here;
      const blockedAt = feet(await action('observe'));
      const footing = await quarryFooting(action, blockedAt);
      await leaveQuarry(action, stairs, policy);
      if (footing) {
        exhaustedQuarries = [...exhaustedQuarries.filter(attempt => String(attempt.entrance) !== String(entrance)),
          { entrance, blockedAt, footing }].slice(-6);
        await policy.saveExhaustedQuarries?.(exhaustedQuarries);
      }
      stairs.length = 0;
      await policy.saveQuarry?.([]);
      quarries++;
      if (quarries >= 3) break;
      misses = 0;
      movingToFreshGround = 8;
      await policy.reportScouting?.('Quarry exit reached. Looking for exposed ore in fresh terrain.');
    }
    const scout = await action('observe');
    visited.push(feet(scout));
    const terrain = scoutDownhill ? 'downhill' : movingToFreshGround ? 'stone' : 'iron';
    const moved = await stepOut(action, scout, visited, undefined, terrain, rejectedSteps);
    if (scoutDownhill) highlandSearch++;
    if (movingToFreshGround) movingToFreshGround--;
    if (moved) blockedCaveSteps = 0;
    else if (++blockedCaveSteps >= 2) {
      blockedCaveSteps = 0;
      misses = 0;
      movingToFreshGround = 8;
      await policy.reportScouting?.('Two blocked approaches. Looking for a different opening.');
    }
  }
  await leaveQuarry(action, stairs, policy);
  await policy.saveQuarry?.([]);
  const materials = await action('get_inventory');
  if (bringFirstIronHome && count(materials, RAW_IRON)) await bringFirstIronHome();
  assert.ok(count(materials, RAW_IRON) >= plan.requiredOre, 'Could not earn enough reachable iron ore for the expedition kit');
  await craftIronKit(action, craft, plan.recipes, plan.requiredOre, materials, visited, false);
}

function ironKitPlan(inventory, { reserveIgnitionIron, makeIronSword, extraEndBucket }) {
  const buckets = count(inventory, 'minecraft:bucket') + count(inventory, 'minecraft:water_bucket');
  const missingBuckets = Math.max(0, (extraEndBucket ? 2 : 1) - buckets);
  const recipes = IRON_RECIPES.flatMap(recipe => {
    const [item] = recipe;
    if (item === 'minecraft:bucket') return Array.from({ length: missingBuckets }, () => recipe);
    return count(inventory, item) ? [] : [recipe];
  });
  if (makeIronSword && !count(inventory, 'minecraft:iron_sword')) {
    recipes.push(['minecraft:iron_sword', 2]);
  }
  const needsIgnitionIngot = reserveIgnitionIron && !count(inventory, 'minecraft:flint_and_steel')
    && !count(inventory, 'minecraft:fire_charge');
  const ingots = recipes.reduce((amount, [, cost]) => amount + cost, Number(Boolean(needsIgnitionIngot)));
  return { recipes, requiredOre: Math.max(0, ingots - count(inventory, IRON_INGOT)) };
}

async function craftIronKit(action, craft, recipes, ore, inventory, visited, packFurnace) {
  const fuel = count(inventory, COAL) ? COAL : CHARCOAL;
  const needsFuel = ore > 0 && !count(inventory, fuel);
  const burnsPlank = needsFuel && ore === 1;
  const needsCharcoal = needsFuel && !burnsPlank;
  const hasShieldRecipe = recipes.some(([item]) => item === SHIELD);
  const tablePlanks = hasShieldRecipe ? 10 : recipes.length ? 4 : 0;
  const planks = tablePlanks + Number(needsFuel);
  await ensurePlanks(action, craft, planks);
  const sticks = recipes.reduce((total, [item]) => total + (
    item === 'minecraft:iron_pickaxe' ? 2 : item === 'minecraft:iron_sword' ? 1 : 0), 0);
  if (sticks && count(await action('get_inventory'), 'minecraft:stick') < sticks) {
    await ensurePlanks(action, craft, planks + 2);
    await craft('minecraft:stick', 4);
  }
  if (needsCharcoal && !(await action('get_inventory')).slots.some(stack => stack.id.endsWith('_log'))) {
    assert.ok(await harvestReachableLog(action), 'Could not collect a reachable log for charcoal');
  }
  if (ore) {
    const furnace = await placeBeside(action, FURNACE);
    await action('interact_block', { pos: furnace });
    if (needsCharcoal) await makeExpeditionCharcoal(action);
    const plank = burnsPlank && (await action('get_inventory')).slots.find(stack => stack.id.endsWith('_planks'));
    if (burnsPlank) assert.ok(plank, 'Need a plank to smelt the first raw iron');
    await smeltExpeditionIron(action, ore, plank ? plank.id : fuel);
    await action('stop', { closeScreen: true });
    if (packFurnace) {
      assert.ok(await recoverPlacedFurnace(action, furnace), 'Could not pack the furnace after smelting the first iron');
    }
  }
  if (!recipes.length) return;
  await craft('minecraft:crafting_table', 1);
  const table = await placeBeside(action, 'minecraft:crafting_table');
  await openCampTable(action, table, visited);
  for (const [item] of recipes) {
    await craft(item, 1);
  }
  await action('stop', { closeScreen: true });
  if (hasShieldRecipe) await equipExpeditionShield(action);
}
