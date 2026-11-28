import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import { eatExpeditionMeal, hold, stepOut } from './expedition-home.mjs';
import { dragonBreathThreat, retreatFromDragonThreat } from './expedition-end-crystals.mjs';

const END = 'minecraft:the_end';
const DRAGON = 'minecraft:ender_dragon';
const APPLE = 'minecraft:golden_apple';
const SWORDS = ['netherite', 'diamond', 'iron', 'stone'].map(tier => `minecraft:${tier}_sword`);
const RATIONS = ['cooked_beef', 'cooked_porkchop', 'cooked_mutton', 'cooked_chicken', 'bread'].map(id => `minecraft:${id}`);
const feet = ({ position }) => [position.x, position.y, position.z].map(Math.floor);

export function findEndFountain(positions) {
  const columns = new Map();
  for (const [x, y, z] of positions) {
    const key = String([x, z]);
    if (!columns.has(key)) columns.set(key, { x, z, heights: new Set() });
    columns.get(key).heights.add(y);
  }
  for (const { x, z, heights } of columns.values()) {
    const base = Math.min(...heights);
    if (!heights.has(base + 1) || !heights.has(base + 2)) continue;
    const rim = positions.filter(([rx, ry, rz]) =>
      ry <= base + 1 && Math.abs(rx - x) <= 4 && Math.abs(rz - z) <= 4 && (rx !== x || rz !== z));
    if (rim.length >= 8) return [x, base, z];
  }
  return null;
}

export async function strikePerchedDragon(action, player, dragon, sword) {
  const head = dragon.perched && dragon.parts?.find(part => part.name === 'head' && part.inReach);
  if (!head || player.attackStrength < 0.95) return null;
  if (player.mainHand?.id !== sword) await hold(action, sword);
  const [x, y, z] = head.center;
  const dx = x - player.position.x;
  const dy = y - player.position.y - 1.62;
  const dz = z - player.position.z;
  await action('look', {
    yaw: Math.atan2(-dx, dz) * 180 / Math.PI,
    pitch: -Math.atan2(dy, Math.hypot(dx, dz)) * 180 / Math.PI,
  });
  const aimed = await action('observe');
  if (!aimed?.onGround || aimed.crosshair?.id !== head.id || aimed.attackStrength < 0.95) return null;
  return action('attack_entity', { entityId: head.id });
}

export function breathBlocksWalk(player, target, clouds) {
  const from = [player.position.x, player.position.y, player.position.z];
  const to = [target[0] + 0.5, target[1], target[2] + 0.5];
  const direction = to.map((coordinate, index) => coordinate - from[index]);
  const lengthSquared = direction.reduce((sum, value) => sum + value ** 2, 0);
  return clouds.some(({ pos }) => {
    const relative = pos.map((coordinate, index) => coordinate - from[index]);
    const projection = relative.reduce((sum, value, index) => sum + value * direction[index], 0);
    const along = lengthSquared ? Math.max(0, Math.min(1, projection / lengthSquared)) : 0;
    const nearest = relative.map((coordinate, index) => coordinate - direction[index] * along);
    return Math.hypot(...nearest) < 8;
  });
}

export async function fightEndDragon(action, report, progress = {}) {
  const start = await action('observe');
  assert.equal(start?.dimension, END);
  const stock = await action('get_inventory');
  const sword = SWORDS.find(id => stock.slots.some(stack => stack.id === id));
  assert.ok(sword, 'The dragon fight requires a sword');
  const view = await action('scan_blocks', { blocks: ['bedrock'], radius: 32, max: 128 });
  const fountain = findEndFountain(view?.matches?.find(group => group.name === 'minecraft:bedrock')?.positions ?? []);
  assert.ok(fountain, 'The native exit fountain was not found');
  await report('fountain', { position: fountain });

  const [fx, , fz] = fountain;
  const bearingX = start.position.x - fx - 0.5;
  const bearingZ = start.position.z - fz - 0.5;
  const bearingLength = Math.hypot(bearingX, bearingZ) || 1;
  const ready = [Math.floor(fx + 0.5 + 8 * bearingX / bearingLength), Math.floor(start.position.y),
    Math.floor(fz + 0.5 + 8 * bearingZ / bearingLength)];
  const visited = [];
  const rejected = new Set();
  let lastPerch;
  let seenDragon = progress.dragon;
  let hits = progress.hits ?? 0;
  let nextMeal = 0;
  for (let attempt = 0; attempt < 1_200; attempt++) {
    const player = await action('observe');
    assert.ok(player?.inWorld && player.dimension === END && !player.dead && player.health >= 4,
      'The player became unsafe during the native dragon fight');
    if (!player.onGround) {
      await setTimeout(200);
      continue;
    }
    // Vanilla's nearby scan can return the head, wings and tails under the
    // same type as their parent. Include all eight parts plus the dragon.
    const dragons = await action('get_entities', { type: DRAGON, radius: 128, max: 16 });
    const dragon = dragons?.entities.find(entity => entity.parts?.some(part => part.name === 'head'));
    if (!dragon && seenDragon) {
      const exit = await action('scan_blocks', { blocks: ['end_portal'], center: fountain, radius: 5, max: 20 });
      const portals = exit?.matches?.find(group => group.name === 'minecraft:end_portal')?.positions ?? [];
      if (portals.length && hits) {
        await report('victory', { dragon: seenDragon, fountain, portals, hits });
        return;
      }
    }
    if (dragon) {
      seenDragon = dragon.uuid;
      if (lastPerch !== dragon.perched) {
        lastPerch = dragon.perched;
        await report('phase', { dragon: dragon.uuid, perched: dragon.perched, health: dragon.health });
      }
    }

    const clouds = (await action('get_entities', { type: 'minecraft:area_effect_cloud', radius: 24, max: 12 }))?.entities ?? [];
    const danger = await dragonBreathThreat(action, clouds);
    if (danger) {
      await retreatFromDragonThreat(action, player, danger);
      continue;
    }
    if ((player.health < 16 || player.food < 18) && player.gameTime >= nextMeal) {
      const inventory = await action('get_inventory');
      const choices = player.health < 14 ? [APPLE, ...RATIONS] : RATIONS;
      const meal = choices.find(id => (id === APPLE || player.food < 20) && inventory.slots.some(stack => stack.id === id));
      if (meal) {
        if (meal === APPLE) {
          await action('look', { pitch: 65 });
          await hold(action, meal);
          await action('use_item', { ticks: 36 });
        } else {
          await eatExpeditionMeal(action, player, meal, 65);
        }
        nextMeal = player.gameTime + 60;
        continue;
      }
    }
    if (dragon?.perched) {
      const hit = await strikePerchedDragon(action, player, dragon, sword);
      if (hit) {
        hits++;
        await report('strike', { dragon: dragon.uuid, before: dragon.health, attackStrength: hit.attackStrength, hits });
        await setTimeout(350);
        continue;
      }
      const head = dragon.parts.find(part => part.name === 'head');
      if (head.inReach) {
        await setTimeout(130);
        continue;
      }
      const [hx, hy, hz] = head.center;
      const dx = hx - fx - 0.5;
      const dz = hz - fz - 0.5;
      const length = Math.hypot(dx, dz) || 1;
      const stance = [Math.floor(hx + 1.3 * dx / length), Math.floor(hy - 1.4), Math.floor(hz + 1.3 * dz / length)];
      if (breathBlocksWalk(player, stance, clouds)) {
        if (player.pitch < 30) await action('look', { pitch: 50 });
        await setTimeout(350);
        continue;
      }
      visited.push(feet(player));
      await stepOut(action, player, visited.slice(-24), stance, 'elevation', rejected, undefined, undefined, 26);
      continue;
    }
    if (Math.hypot(player.position.x - ready[0] - 0.5, player.position.z - ready[2] - 0.5) > 2
        && !breathBlocksWalk(player, ready, clouds)) {
      visited.push(feet(player));
      await stepOut(action, player, visited.slice(-24), ready, 'surface', rejected, undefined, undefined, 44);
      continue;
    }
    if (player.pitch < 30) await action('look', { pitch: 50 });
    await setTimeout(450);
  }
  throw new Error('The dragon fight did not reach a native open exit');
}
