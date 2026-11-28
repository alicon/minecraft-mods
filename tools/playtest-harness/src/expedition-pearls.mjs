import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import { hold, retreatFromNearbyMob, stepOut, visible } from './expedition-home.mjs';
import { useEmptyHandOnCompanion } from './expedition-gear.mjs';
import { hasDrySupport, nearestCover } from './expedition-navigation.mjs';
import { OVERWORLD, withCompanion } from './expedition-nether.mjs';

const ENDERMAN = 'minecraft:enderman';
const PEARL = 'minecraft:ender_pearl';
const DOG = 'mushroom_yorkie:mushroom_yorkie';
const IRON_SWORD = 'minecraft:iron_sword';
const ROOF = /^minecraft:(?:cobblestone|stone|stone_bricks|deepslate|andesite|diorite|granite|[\w]+_planks)$/;
const feet = ({ position: { x, y, z } }) => [x, y, z].map(Math.floor);
const distance = (a, b) => Math.hypot(...a.map((coordinate, axis) => coordinate - b[axis]));
const count = stock => stock.slots.reduce((total, stack) => total + (stack.id === PEARL ? stack.count : 0), 0);

function clearGaze(at, [x, y, z], [tx, ty, tz]) {
  const from = [x + 0.5, y + 1.62, z + 0.5];
  const to = [tx, ty + 2.55, tz];
  const steps = Math.ceil(distance(from, to) * 5);
  for (let step = 1; step < steps; step++) {
    const tile = from.map((coordinate, axis) => Math.floor(coordinate + (to[axis] - coordinate) * step / steps));
    if (at.has(String(tile))) return false;
  }
  return true;
}

function lowShelter(cells, origin, enderman, dog) {
  const at = new Map(cells.map(({ x, y, z, b }) => [String([x, y, z]), b]));
  return cells.flatMap(({ x, y, z, b }) => {
    const stance = [x, y + 1, z];
    if (!hasDrySupport(b) || Math.abs(stance[1] - origin[1]) > 2 || distance(stance, dog.pos) < 6
        || distance(stance, enderman.pos) > 15 || !clearGaze(at, stance, enderman.pos)) return [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (at.has(String([x + dx, y + 1, z + dz])) || at.has(String([x + dx, y + 2, z + dz]))
            || !ROOF.test(at.get(String([x + dx, y + 3, z + dz])) ?? '')) return [];
      }
    }
    return [stance];
  }).sort((first, second) => distance(first, enderman.pos) - distance(second, enderman.pos)
    || distance(first, origin) - distance(second, origin))[0];
}

async function walkTo(action, target, within = 0) {
  const stride = { pos: target, stopDistance: 0.3, maxTicks: 60 };
  const visited = [];
  const rejected = new Set();
  for (let attempt = 0; attempt < 10; attempt++) {
    const player = await action('observe');
    if (!player?.inWorld || player.dead || player.dimension !== OVERWORLD || player.health < 10) return false;
    if (player.onGround && distance(feet(player), target) <= within) return true;
    if (distance(feet(player), target) <= 6 && (await action('go_to', stride))?.arrived) continue;
    visited.push(feet(player));
    if (!await stepOut(action, player, visited, target, undefined, rejected)) return false;
  }
  return false;
}

async function lureAndStrike(action, stance, target, dog, report) {
  let absent = 0;
  for (let attempt = 0; attempt < 20; attempt++) {
    const player = await action('observe');
    if (!player?.onGround || player.health < 10 || String(feet(player)) !== String(stance)
        || player.threats?.some(threat => threat.id !== target.id && threat.distance < 8)) return;
    const nearby = await action('get_entities', { type: ENDERMAN, radius: 20 });
    const enderman = nearby?.entities.find(entity => entity.uuid === target.uuid);
    if (!enderman) {
      if (++absent >= 6) return;
      await setTimeout(400);
      continue;
    }
    absent = 0;
    if (distance(enderman.pos, dog.pos) < 5 || Math.abs(enderman.pos[1] - stance[1]) > 2) return;
    if (enderman.distance <= 3.4 && await visible(action, enderman.id)) {
      const attack = await action('attack_entity', { entityId: enderman.id });
      if (attack) await report('strike', { target: enderman.uuid, stance, strength: attack.attackStrength });
      await setTimeout(800);
      continue;
    }
    const dx = enderman.pos[0] - player.position.x;
    const dy = enderman.pos[1] + 2.55 - player.position.y - 1.62;
    const dz = enderman.pos[2] - player.position.z;
    await action('look', { yaw: Math.atan2(-dx, dz) * 180 / Math.PI,
      pitch: -Math.atan2(dy, Math.hypot(dx, dz)) * 180 / Math.PI });
    // An Enderman within sixteen blocks freezes while its target keeps looking at its eyes.
    await setTimeout(425);
    await action('look', { pitch: 65 });
    await setTimeout(600);
  }
}

export async function earnEnderPearls(action, uuid, wanted, report = async () => {}) {
  const start = await withCompanion(action, OVERWORLD, uuid);
  const stock = await action('get_inventory');
  if (count(stock) >= wanted) return;
  assert.ok(stock.slots.some(stack => stack.id === IRON_SWORD), 'The pearl hunt requires the earned iron sword');
  const home = feet(start);
  const volume = await action('get_blocks', { center: home, size: [23, 9, 23], format: 'json' });
  const camp = volume && nearestCover(volume.cells, home);
  assert.ok(camp && await walkTo(action, camp), 'No covered camp near the player for Mushroom during the pearl hunt');
  await useEmptyHandOnCompanion(action, uuid);
  const dogs = await action('get_entities', { type: DOG, radius: 12 });
  const dog = dogs?.entities.find(entity => entity.uuid === uuid && entity.health > 0);
  assert.ok(dog?.distance <= 4, 'The original Mushroom did not reach camp before the pearl hunt');
  const settled = dog.pos;
  const [x, y, z] = settled.map(Math.floor);
  const dogRoof = await action('get_blocks', { center: [x, y + 2, z], size: [1, 1, 1], format: 'json' });
  assert.ok(dogRoof?.cells.some(cell => ROOF.test(cell.b)), 'Mushroom is outside the covered part of camp');
  await report('camp', { dog: uuid, position: settled });
  const reflexes = await action('set_reflexes');
  await action('set_reflexes', { autoDefend: false, chargeRanged: false });
  try {
    const visited = [];
    const rejected = new Set();
    const tried = new Map();
    for (let attempt = 0; attempt < 48 + wanted * 8; attempt++) {
      if (count(await action('get_inventory')) >= wanted) break;
      const player = await action('observe');
      assert.ok(player?.inWorld && !player.dead && player.health >= 10, 'The pearl hunt became unsafe');
      const here = feet(player);
      const otherThreats = { ...player, threats: player.threats?.filter(threat => threat.type !== ENDERMAN) };
      if (await retreatFromNearbyMob(action, otherThreats, visited, rejected)) continue;
      const view = await action('get_entities', { radius: 24, max: 96 });
      const currentDog = view?.entities.find(entity => entity.uuid === uuid && entity.health > 0);
      assert.ok(currentDog && distance(currentDog.pos, settled) <= 3,
        'The original Mushroom left cover during the pearl hunt');
      const enemies = view.entities.filter(entity => entity.type === ENDERMAN);
      const drop = view.entities.find(entity => entity.item?.id === PEARL && entity.distance <= 10
        && !view.entities.some(threat => threat.hostile && distance(threat.pos, entity.pos) < 7));
      if (drop) {
        await action('go_to', { entityId: drop.id, stopDistance: 0.3, maxTicks: 45 });
        continue;
      }
      const target = enemies.find(entity => distance(entity.pos, settled) >= 8 && Math.abs(entity.pos[1] - here[1]) <= 2
        && (tried.get(entity.uuid) ?? -4) <= attempt - 4);
      if (target) {
        const nearby = await action('get_blocks', { center: here, size: [23, 9, 23], format: 'json' });
        const stance = nearby && lowShelter(nearby.cells, here, target, currentDog);
        tried.set(target.uuid, attempt);
        if (stance && await walkTo(action, stance)) {
          await hold(action, IRON_SWORD);
          await lureAndStrike(action, stance, target, currentDog, report);
          continue;
        }
      }
      visited.push(here);
      const toward = distance(here, settled) > 15 ? camp : target?.pos;
      await stepOut(action, player, visited, toward, 'surface', rejected, undefined, undefined, 36);
    }
  } finally {
    if (reflexes) await action('set_reflexes', { autoDefend: reflexes.autoDefend, chargeRanged: reflexes.chargeRanged });
  }
  assert.ok(await walkTo(action, camp, 1), 'Could not return to Mushroom after searching for pearls');
  await useEmptyHandOnCompanion(action, uuid);
  await withCompanion(action, OVERWORLD, uuid);
  assert.ok(count(await action('get_inventory')) >= wanted, 'The Enderman hunt did not yield the required pearls');
}
