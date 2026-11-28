import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import { eatExpeditionMeal, hold, regroupExpeditionCompanion, stepOut, visible } from './expedition-home.mjs';
import { dragonBreathThreat, enterEndermanRefuge, retreatFromDragonThreat } from './expedition-end-crystals.mjs';
import { catchEndFall } from './expedition-end-cage.mjs';
import { useEmptyHandOnCompanion } from './expedition-gear.mjs';
import { bowAim, movingBowAim } from './expedition-ballistics.mjs';
import { approachEndTrail, climbEndTrailWithCompanion, walkBackToEndCamp } from './expedition-end-route.mjs';

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

export function dragonSweepDodge(player, previous, current, fountain) {
  if (!previous || !current || previous.dragon.uuid !== current.dragon.uuid
      || previous.dragon.perched || current.dragon.perched) return null;
  const elapsed = current.tick - previous.tick;
  if (elapsed < 2 || elapsed > 24) return null;
  const { x, y, z } = player.position;
  for (const part of current.dragon.parts) {
    if (!['head', 'body', 'wing'].includes(part.name)) continue;
    const prior = previous.dragon.parts.find(box => box.id === part.id);
    if (!prior) continue;
    const [dx, dy, dz] = part.center.map((coordinate, axis) => (coordinate - prior.center[axis]) / elapsed);
    const speed = Math.hypot(dx, dz);
    const [px, py, pz] = part.center;
    const horizontalRange = Math.hypot(px - x, pz - z);
    if (speed < 0.35 || speed > 2.5 || horizontalRange > 24) continue;
    const closest = ((x - px) * dx + (z - pz) * dz) / speed ** 2;
    if (closest < 1 || closest > 23 || Math.abs(py + closest * dy - y - 1) > 6) continue;
    const gap = Math.hypot(px + dx * closest - x, pz + dz * closest - z);
    if (gap > 5.5) continue;
    const [fx, , fz] = fountain;
    const options = [-1, 1].map(side => [x - side * 8 * dz / speed, y, z + side * 8 * dx / speed]);
    options.sort((a, b) => Math.hypot(a[0] - fx, a[2] - fz) - Math.hypot(b[0] - fx, b[2] - fz));
    return { target: options[0].map(Math.floor), part: part.name, ticks: closest };
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

export function perchApproach(player, head, fountain, clouds) {
  const [hx, hy, hz] = head.center;
  const [fx, , fz] = fountain;
  const dx = hx - fx - 0.5;
  const dz = hz - fz - 0.5;
  const length = Math.hypot(dx, dz) || 1;
  const stance = [Math.floor(hx + 1.3 * dx / length), Math.floor(hy - 1.4), Math.floor(hz + 1.3 * dz / length)];
  if (!breathBlocksWalk(player, stance, clouds)) return { target: stance, waiting: false };

  // Move to a clear flank while the breath covers striking distance.
  const here = feet(player);
  const ring = Array.from({ length: 16 }, (_, index) => {
    const angle = index * Math.PI / 8;
    return [Math.floor(fx + Math.cos(angle) * 11), here[1], Math.floor(fz + Math.sin(angle) * 11)];
  });
  const distance = ([x, , z]) => Math.hypot(x - stance[0], z - stance[2]);
  const [best] = [here, ...ring.filter(target => !breathBlocksWalk(player, target, clouds))]
    .sort((a, b) => distance(a) - distance(b));
  return { target: best === here ? null : best, waiting: true };
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

export async function refillEndBucket(action, inventory, water) {
  if (!inventory.slots.some(stack => stack.id === BUCKET)) return false;
  await hold(action, BUCKET);
  await action('look', water ? { at: water } : { pitch: 90 });
  const filled = await action('use_item');
  if (filled?.mainHand?.id !== WATER_BUCKET) return false;
  const selected = (await action('get_inventory')).selectedSlot;
  const workSlot = selected === inventory.selectedSlot ? (selected + 1) % 9 : inventory.selectedSlot;
  await action('select_slot', { slot: workSlot });
  return true;
}

export function chooseEndWater(scan, player, fountain, triedWater) {
  const positions = scan?.matches?.find(group => group.name === 'minecraft:water')?.positions ?? [];
  const { x, y, z } = player.position;
  const reachable = ([wx, wy, wz]) => Math.hypot(wx + 0.5 - x, wz + 0.5 - z) + 3 * Math.abs(wy - y);
  const candidates = positions.filter(pos => !triedWater.has(String(pos))
    && Math.hypot(pos[0] - fountain[0], pos[2] - fountain[2]) >= 10);
  if (scan?.waterSourcesOnly) return candidates.sort((a, b) => reachable(a) - reachable(b))[0];
  // Older clients report every flowing block. Prefer the high point of each nearby pool.
  const poolTops = candidates.filter(([wx, wy, wz]) => !positions.some(([px, py, pz]) =>
    py > wy && Math.hypot(px - wx, pz - wz) <= 8));
  return poolTops.sort((a, b) => reachable(a) - reachable(b))[0];
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
  const view = await action('scan_blocks', { blocks: ['bedrock'], center: progress.fountain, radius: 32, max: 128 });
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
  let lastDragonFrame;
  let lastHealth = start.health;
  let endermanAttacker;
  let refugeUntil = 0;
  let usedRefuge = false;
  let nextWaterSearch = 0;
  let waterTarget;
  let waterSteps = 0;
  const triedWater = new Set();
  let recovering = false;
  for (let attempt = 0; attempt < 1_200; attempt++) {
    const player = await action('observe');
    assert.ok(player?.inWorld && player.dimension === END && !player.dead && player.health > 0,
      'The player died during the native dragon fight');
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
        assert.ok(confirmed?.inWorld && !confirmed.dead && confirmed.health > 0,
          'The player died on landing');
      }
      await report('fall_recovery', { launchY, groundY, landed: true, inWater: player.inWater });
      launchY = undefined;
      if (player.inWater) await keepLandingBucketOnHotbar(action, await action('get_inventory'));
    }
    groundY = player.position.y;
    // Vanilla's nearby scan can return the head, wings and tails under the
    // same type as their parent. Include all eight parts plus the dragon.
    const dragon = await observeDragon(action);
    const dragonFrame = dragon && { tick: player.gameTime, dragon };
    const dodge = shootWhileFlying ? dragonSweepDodge(player, lastDragonFrame, dragonFrame, fountain) : null;
    lastDragonFrame = dragonFrame;
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
        await refillEndBucket(action, await action('get_inventory'));
      }
    }
    if (player.health < 8) recovering = true;
    if (recovering && player.health >= 14) {
      recovering = false;
      await report('health_recovered', { health: player.health });
    }
    if (dodge && await stepOut(action, player, [], dodge.target, 'surface', new Set(), undefined, undefined, 18)) {
      await report('sweep_dodge', dodge);
      continue;
    }
    if (stopAfterRefuge || recovering || dodge) {
      await setTimeout(200);
      continue;
    }
    if (nativeWaterLanding && player.onGround && player.health >= 14 && !player.threats?.some(threat => threat.distance < 6)
        && (waterTarget || player.gameTime >= nextWaterSearch)) {
      const inventory = await action('get_inventory');
      if (!waterTarget && !inventory.slots.some(stack => stack.id === WATER_BUCKET)) {
        const water = await action('scan_blocks', { blocks: ['water'], radius: 28, max: 256, waterSourcesOnly: true });
        waterTarget = chooseEndWater(water, player, fountain, triedWater);
        waterSteps = 0;
      }
      nextWaterSearch = player.gameTime + 180;
      if (waterTarget && !breathBlocksWalk(player, waterTarget, clouds)) {
        const water = waterTarget;
        const eye = [player.position.x, player.position.y + 1.62, player.position.z];
        if (Math.hypot(...water.map((axis, index) => axis + 0.5 - eye[index])) <= 4.15) {
          if (await refillEndBucket(action, inventory, water)) {
            await report('bucket_refilled', { position: water });
          } else {
            triedWater.add(String(water));
          }
          waterTarget = undefined;
          continue;
        }
        if (waterSteps++ < 6 && await stepOut(action, player, [], water, 'surface', rejected, undefined, undefined, 36)) continue;
        triedWater.add(String(water));
      }
      waterTarget = undefined;
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
      const approach = perchApproach(player, head, fountain, clouds);
      if (!approach.target) {
        if (player.pitch < 30) await action('look', { pitch: 50 });
        await setTimeout(350);
        continue;
      }
      visited.push(feet(player));
      const moved = await stepOut(action, player, visited.slice(-24), approach.target,
        approach.waiting ? 'surface' : 'elevation', rejected, undefined, undefined, 26);
      if (moved && approach.waiting) await report('perch_flank', { target: approach.target });
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

export async function recallEndCompanion(action, uuid, shelter, report, trail) {
  if (trail) {
    await approachEndTrail(action, trail.at(-1));
    await walkBackToEndCamp(action, trail);
  }
  const dog = await regroupExpeditionCompanion(action, uuid, shelter);
  await report('camp_returned', { position: dog.pos, health: dog.health });
  await useEmptyHandOnCompanion(action, uuid);
  await report('recalled', { previousPosition: dog.pos });
  if (trail) {
    await climbEndTrailWithCompanion(action, trail, async tile => {
      for (let check = 0; check < 20; check++) {
        const dogs = await action('get_entities', { type: DOG, radius: 12 });
        if (dogs?.entities.some(entity => entity.uuid === uuid && entity.health > 0
            && entity.distance <= 5 && entity.pos[1] >= tile[1] - 1.2)) return;
        await setTimeout(250);
      }
      throw new Error(`The original Mushroom has not followed up the End staircase near ${tile}`);
    });
  }
}

export async function recallAndExitEnd(action, uuid, shelter, portals, report, trail) {
  await recallEndCompanion(action, uuid, shelter, report, trail);
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
