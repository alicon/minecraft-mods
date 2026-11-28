import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import { eatExpeditionMeal, hold, regroupExpeditionCompanion, stepOut, visible } from './expedition-home.mjs';
import { dragonBreathThreat, enterEndermanRefuge, retreatFromDragonThreat } from './expedition-end-crystals.mjs';
import { catchEndFall } from './expedition-end-cage.mjs';
import { useEmptyHandOnCompanion } from './expedition-gear.mjs';
import { bowAim, movingBowAim } from './expedition-ballistics.mjs';

const END = 'minecraft:the_end';
const DRAGON = 'minecraft:ender_dragon';
const DOG = 'mushroom_yorkie:mushroom_yorkie';
const APPLE = 'minecraft:golden_apple';
const WATER_BUCKET = 'minecraft:water_bucket';
const BOW = 'minecraft:bow';
const ARROW = 'minecraft:arrow';
const ENDERMAN = 'minecraft:enderman';
const BUCKET = 'minecraft:bucket';
const SWORDS = ['netherite', 'diamond', 'iron', 'stone'].map(tier => `minecraft:${tier}_sword`);
const RATIONS = ['cooked_beef', 'cooked_porkchop', 'cooked_mutton', 'cooked_chicken', 'bread'].map(id => `minecraft:${id}`);
const feet = ({ position }) => [position.x, position.y, position.z].map(Math.floor);
const partCenter = (dragon, part) => dragon.parts.find(box => box.name === part)?.center;

export function leadDragonShot(player, previous, current, drawTicksLeft) {
  const head = partCenter(current.dragon, 'head');
  const body = partCenter(current.dragon, 'body');
  const { x, y, z } = player.position;
  const range = ([px, py, pz]) => Math.hypot(px - x, py - y - 1.62, pz - z);
  const exposedHead = head && body && range(head) <= 34 && range(body) - range(head) >= 3;
  for (const part of exposedHead || !body ? ['head', 'body'] : ['body']) {
    const from = partCenter(previous.dragon, part);
    const now = partCenter(current.dragon, part);
    if (!from || !now) continue;
    const shot = movingBowAim(player, { tick: previous.tick, pos: from }, { tick: current.tick, pos: now }, drawTicksLeft);
    if (shot) return { ...shot, part };
  }
  return null;
}

async function observeDragon(action) {
  const view = await action('get_entities', { type: DRAGON, radius: 128, max: 16 });
  return view?.entities.find(entity => entity.parts?.some(part => part.name === 'head'));
}

function endermanThatHit(player, previousHealth) {
  const reported = player.events?.map(event => /damage from minecraft:enderman #(\d+)/.exec(event)).find(Boolean);
  if (reported) return Number(reported[1]);
  if (!player.events?.length && player.health <= previousHealth - 1.5
      && !player.threats?.some(threat => threat.type === DRAGON && threat.distance <= 10)) {
    return player.threats?.find(threat => threat.type === ENDERMAN && threat.distance <= 3)?.id;
  }
  return undefined;
}

async function shootFlyingDragon(action, player, dragon) {
  const initialAim = bowAim(player, partCenter(dragon, 'body') ?? partCenter(dragon, 'head'));
  if (!initialAim) return null;
  if (player.mainHand?.id !== BOW) await hold(action, BOW);
  await action('look', initialAim);
  let drawError;
  let drawFinished = false;
  const draw = action('use_item', { ticks: 32 }).catch(error => { drawError = error; })
    .finally(() => { drawFinished = true; });
  let previous;
  let lead;
  try {
    for (let check = 0; check < 10; check++) {
      await setTimeout(140);
      const pose = await action('observe');
      const left = pose?.agent?.useTicksLeft ?? 0;
      if (left < 3 || !pose.onGround || pose.health < player.health - 1) break;
      const target = await observeDragon(action);
      if (!target || target.perched || target.uuid !== dragon.uuid) break;
      const sample = { tick: pose.gameTime, dragon: target };
      if (previous && left <= 15) {
        const candidate = leadDragonShot(pose, previous, sample, left);
        if (candidate && await action('look', candidate.aim) && !drawFinished) {
          lead = { tick: pose.gameTime, before: target.health, flightTicks: candidate.flightTicks, part: candidate.part };
        }
      }
      previous = sample;
    }
  } finally {
    const release = await draw;
    if (drawError) throw drawError;
    if (!release?.completed) lead = null;
  }
  return lead;
}

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

export async function strikePerchedDragon(action, player, dragon, weapon) {
  const head = dragon.perched && dragon.parts?.find(part => part.name === 'head' && part.inReach);
  if (!head || player.attackStrength < 0.95) return null;
  if (player.mainHand?.id !== weapon) await hold(action, weapon);
  const [x, y, z] = head.center;
  const dx = x - player.position.x;
  const dy = y - player.position.y - 1.62;
  const dz = z - player.position.z;
  const horizontal = Math.hypot(dx, dz) || 1;
  // The neck can occlude the head center even though part of it is in reach.
  for (const [side, rise] of [[0, 0], [0, 0.35], [0.38, 0], [-0.38, 0]]) {
    const offsetX = dx - side * dz / horizontal;
    const offsetZ = dz + side * dx / horizontal;
    await action('look', {
      yaw: Math.atan2(-offsetX, offsetZ) * 180 / Math.PI,
      pitch: -Math.atan2(dy + rise, Math.hypot(offsetX, offsetZ)) * 180 / Math.PI,
    });
    const aimed = await action('observe');
    if (!aimed?.onGround || aimed.attackStrength < 0.95) return null;
    if (aimed.crosshair?.id === head.id) return action('attack_entity', { entityId: head.id });
  }
  return null;
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

export async function keepLandingBucketOnHotbar(action, stock) {
  const buckets = stock.slots.filter(stack => stack.id === WATER_BUCKET);
  if (!buckets.length || buckets.some(stack => stack.slot < 9)) return;
  const hotbar = Array.from({ length: 9 }, (_, slot) => stock.slots.find(stack => stack.slot === slot));
  const free = hotbar.findIndex(stack => !stack);
  const replacement = free >= 0 ? free : hotbar.findIndex(stack =>
    ['minecraft:bucket', 'minecraft:arrow', 'minecraft:cobblestone'].includes(stack.id));
  const slot = replacement >= 0 ? replacement : stock.selectedSlot;
  await action('select_slot', { slot });
  await hold(action, WATER_BUCKET);
  const workingSlot = slot === stock.selectedSlot ? (slot + 1) % 9 : stock.selectedSlot;
  await action('select_slot', { slot: workingSlot });
}

export async function fightEndDragon(action, report, progress = {},
    { useCarriedPickaxe = false, nativeWaterLanding = false, shootWhileFlying = false, stopAfterRefuge = false } = {}) {
  const start = await action('observe');
  assert.equal(start?.dimension, END);
  const stock = await action('get_inventory');
  const options = useCarriedPickaxe ? [...SWORDS, 'minecraft:diamond_pickaxe'] : SWORDS;
  const weapon = options.find(id => stock.slots.some(stack => stack.id === id));
  assert.ok(weapon, 'The dragon fight requires a carried weapon');
  if (nativeWaterLanding) await keepLandingBucketOnHotbar(action, stock);
  const view = await action('scan_blocks', { blocks: ['bedrock'], radius: 32, max: 128 });
  const fountain = findEndFountain(view?.matches?.find(group => group.name === 'minecraft:bedrock')?.positions ?? []);
  assert.ok(fountain, 'The native exit fountain was not found');
  await report('fountain', { position: fountain });

  const [fx, , fz] = fountain;
  const bearingX = start.position.x - fx - 0.5;
  const bearingZ = start.position.z - fz - 0.5;
  const bearingLength = Math.hypot(bearingX, bearingZ) || 1;
  const archerRadius = shootWhileFlying ? 17 : 8;
  const ready = [Math.floor(fx + 0.5 + archerRadius * bearingX / bearingLength), Math.floor(start.position.y),
    Math.floor(fz + 0.5 + archerRadius * bearingZ / bearingLength)];
  const visited = [];
  const rejected = new Set();
  let lastPerch;
  let seenDragon = progress.dragon;
  let hits = progress.hits ?? 0;
  let nextMeal = 0;
  let groundY = start.onGround ? start.position.y : fountain[1] + 1;
  let launchY;
  let shots = shootWhileFlying && stock.slots.some(stack => stack.id === BOW)
    ? stock.slots.filter(stack => stack.id === ARROW).reduce((sum, stack) => sum + stack.count, 0) : 0;
  let nextShot = 0;
  let pendingShot;
  let lastHealth = start.health;
  let endermanAttacker;
  let refugeUntil = 0;
  let usedRefuge = false;
  for (let attempt = 0; attempt < 1_200; attempt++) {
    const player = await action('observe');
    assert.ok(player?.inWorld && player.dimension === END && !player.dead && player.health >= 4,
      'The player became unsafe during the native dragon fight');
    const attacker = endermanThatHit(player, lastHealth);
    lastHealth = player.health;
    if (attacker !== undefined) {
      endermanAttacker = attacker;
      refugeUntil = player.gameTime + 180;
    }
    if (!player.onGround && !player.inWater) {
      if (Math.abs(player.position.y - groundY) >= 4) {
        if (nativeWaterLanding) {
          launchY = Math.max(launchY ?? player.position.y, player.position.y);
        } else {
          const landed = await catchEndFall(action, player);
          await report('fall_recovery', { launchY: player.position.y, groundY, landed });
          if (landed) continue;
        }
      }
      await setTimeout(200);
      continue;
    }
    if (launchY !== undefined) {
      if (!player.inWater) {
        await setTimeout(100);
        const confirmed = await action('observe');
        assert.ok(confirmed?.inWorld && !confirmed.dead && confirmed.health >= 4,
          'The player became unsafe on landing');
      }
      await report('fall_recovery', { launchY, groundY, landed: true, inWater: player.inWater });
      launchY = undefined;
      if (player.inWater) await keepLandingBucketOnHotbar(action, await action('get_inventory'));
    }
    groundY = player.position.y;
    // Vanilla's nearby scan can return the head, wings and tails under the
    // same type as their parent. Include all eight parts plus the dragon.
    const dragon = await observeDragon(action);
    if (!dragon && seenDragon) {
      const exit = await action('scan_blocks', { blocks: ['end_portal'], center: fountain, radius: 5, max: 20 });
      const portals = exit?.matches?.find(group => group.name === 'minecraft:end_portal')?.positions ?? [];
      if (portals.length && hits) {
        const victory = { dragon: seenDragon, fountain, portals, hits };
        await report('victory', victory);
        return victory;
      }
    }
    if (dragon) {
      seenDragon = dragon.uuid;
      if (pendingShot && player.gameTime > pendingShot.tick + pendingShot.flightTicks + 30) pendingShot = null;
      if (pendingShot && dragon.health < pendingShot.before) {
        hits++;
        await report('strike', { dragon: dragon.uuid, before: pendingShot.before, after: dragon.health,
          hits, method: 'bow', aimedPart: pendingShot.part });
        pendingShot = null;
      }
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
    let sheltered = player.inWater && usedRefuge;
    if (player.gameTime < refugeUntil && !sheltered && await enterEndermanRefuge(action, player)) {
      sheltered = true;
      usedRefuge = true;
      await report('enderman_refuge', { attacker: endermanAttacker, health: player.health });
      if (stopAfterRefuge) return null;
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
    if (player.gameTime < refugeUntil) {
      const pursuer = player.threats?.find(threat => threat.id === endermanAttacker);
      if (pursuer?.distance < 3 && player.attackStrength >= 0.95) {
        if (player.mainHand?.id !== weapon) await hold(action, weapon);
        if (await visible(action, pursuer.id)) await action('attack_entity', { entityId: pursuer.id });
        await setTimeout(250);
        continue;
      }
      if (sheltered) {
        await setTimeout(300);
        continue;
      }
    }
    if (usedRefuge && player.gameTime >= refugeUntil) {
      usedRefuge = false;
      if (player.inWater && !player.threats?.some(threat => threat.distance < 6)) {
        const inventory = await action('get_inventory');
        if (inventory.slots.some(stack => stack.id === BUCKET)) {
          await hold(action, BUCKET);
          await action('look', { pitch: 90 });
          const filled = await action('use_item');
          if (filled?.mainHand?.id === WATER_BUCKET) {
            const selected = (await action('get_inventory')).selectedSlot;
            const workSlot = selected === inventory.selectedSlot ? (selected + 1) % 9 : inventory.selectedSlot;
            await action('select_slot', { slot: workSlot });
          }
        }
      }
    }
    if (stopAfterRefuge) {
      await setTimeout(200);
      continue;
    }
    // Stay beyond the breath around the fountain while the bow is the
    // safer way to whittle down the dragon. Approach for the final hits.
    if (dragon?.perched && (!shootWhileFlying || !shots || dragon.health <= 65)) {
      const hit = await strikePerchedDragon(action, player, dragon, weapon);
      if (hit) {
        pendingShot = null;
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
    if (dragon && !dragon.perched && shots && player.health >= 14 && player.gameTime >= nextShot
        && dragon.distance >= 12 && dragon.distance <= 58
        && !player.threats?.some(threat => threat.type === ENDERMAN && threat.distance < 4)) {
      const shot = await shootFlyingDragon(action, player, dragon);
      shots--;
      nextShot = player.gameTime + 55;
      if (shot) {
        pendingShot = shot;
        await report('bow_release', { ...shot, dragon: dragon.uuid, shotsRemaining: shots });
      }
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

export async function recallAndExitEnd(action, uuid, shelter, portals, report) {
  const dog = await regroupExpeditionCompanion(action, uuid, shelter);
  await useEmptyHandOnCompanion(action, uuid);
  await report('recalled', { previousPosition: dog.pos });
  const visited = [];
  const rejected = new Set();
  let lastJump;
  for (let attempt = 0; attempt < 100; attempt++) {
    const player = await action('observe');
    if (player?.dimension === 'minecraft:overworld') {
      const companion = (await action('get_entities', { type: DOG, radius: 32 }))?.entities
        .find(entity => entity.uuid === uuid && entity.health > 0);
      if (companion) return;
    }
    if (!player?.inWorld || player.dimension !== END || player.screen || !player.onGround) {
      await setTimeout(180);
      continue;
    }
    const follower = (await action('get_entities', { type: DOG, radius: 32 }))?.entities
      .find(entity => entity.uuid === uuid && entity.health > 0);
    if (!follower || follower.distance > 8) {
      await setTimeout(350);
      continue;
    }
    const ordered = portals.map(pos => ({ pos, dx: pos[0] + 0.5 - player.position.x,
      dz: pos[2] + 0.5 - player.position.z }))
      .sort((first, second) => Math.hypot(first.dx, first.dz) - Math.hypot(second.dx, second.dz));
    const { pos, dx, dz } = ordered.find(({ pos }) => pos !== lastJump) ?? ordered[0];
    const distance = Math.hypot(dx, dz);
    if (distance <= 3.2 && Math.abs(pos[1] - player.position.y) <= 2) {
      lastJump = pos;
      const yaw = Math.atan2(-dx, dz) * 180 / Math.PI;
      await action('move', { yaw, forward: true, jump: true, ticks: 12 });
      await setTimeout(350);
      continue;
    }
    visited.push(feet(player));
    await stepOut(action, player, visited.slice(-24), pos, distance < 8 ? 'elevation' : 'surface',
      rejected, undefined, undefined, 36);
  }
  throw new Error('Could not reach the Overworld with the original Mushroom through the End exit');
}
