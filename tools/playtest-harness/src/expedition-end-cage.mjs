import { setTimeout } from 'node:timers/promises';
import { hold, stepOut } from './expedition-home.mjs';
import { dryWaypoint, hasDrySupport } from './expedition-navigation.mjs';
import { clearBowArc } from './expedition-ballistics.mjs';

const BARS = 'minecraft:iron_bars';
const MATERIAL = ['minecraft:cobblestone', 'minecraft:end_stone', 'minecraft:dirt'];
const PICKAXE = ['netherite', 'diamond', 'iron', 'stone'].map(tier => `minecraft:${tier}_pickaxe`);
const WATER = 'minecraft:water';
const WATER_BUCKET = 'minecraft:water_bucket';
const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const feet = ({ position }) => [position.x, position.y, position.z].map(Math.floor);
const horizontal = ([ax, , az], [bx, , bz]) => Math.hypot(ax - bx, az - bz);

export function cageApproach(cells, crystal, player) {
  const [x, y, z] = crystal.pos.map(Math.floor);
  const here = feet(player);
  const blocks = new Map(cells.map(cell => [`${cell.x},${cell.y},${cell.z}`, cell.b]));
  const block = (x, y, z) => blocks.get(`${x},${y},${z}`);
  const approaches = [];
  for (const [dx, dz] of SIDES) {
    const bars = [-1, 0, 1].flatMap(height => [0, -1, 1]
      .map(offset => [x + dx * 2 + dz * offset, y + height, z + dz * 2 + dx * offset]));
    if (!bars.some(pos => block(...pos) === BARS)) continue;
    for (const offset of [4, 5, 6]) {
      const baseX = x + dx * offset;
      const baseZ = z + dz * offset;
      for (let baseY = here[1] + 4; baseY >= here[1] - 5; baseY--) {
        const top = y - 1;
        if (top <= baseY || top - baseY > 46 || !hasDrySupport(block(baseX, baseY - 1, baseZ))
            || !hasDrySupport(block(baseX + dx, baseY - 1, baseZ + dz))) continue;
        let clear = true;
        for (let height = baseY; height <= top + 2; height++) {
          if (block(baseX, height, baseZ) || block(baseX + dx, height, baseZ + dz)) {
            clear = false;
            break;
          }
        }
        if (clear) {
          approaches.push({ base: [baseX, baseY, baseZ], top, dx, dz, bars });
          break;
        }
      }
    }
  }
  return approaches.sort((a, b) => horizontal(a.base, here) - horizontal(b.base, here)
    || Math.abs(a.base[1] - here[1]) - Math.abs(b.base[1] - here[1]))[0];
}

async function leaveShallowWater(action, line) {
  for (let step = 0; step < 10; step++) {
    const player = await action('observe');
    if (!player?.inWorld || player.dead) return false;
    if (player.onGround && !player.inWater) return true;
    const here = feet(player);
    const view = await action('get_blocks', { center: here, size: [13, 7, 13], format: 'json' });
    if (!view || view.stats?.unloadedChunks) return false;
    // Allow shallow water in the route while still requiring solid support.
    const footing = view.cells.filter(cell => cell.b !== WATER || cell.y < here[1]);
    const next = dryWaypoint(footing, here, [], line, 'surface');
    if (!next) return false;
    await action('go_to', { pos: next, stopDistance: 0.3, maxTicks: 55 });
  }
  return false;
}

async function descendWater(action, player, plan, line) {
  const [x, y, z] = feet(player);
  if (y <= plan.base[1] + 1) return true;
  const water = [x + plan.dx, plan.base[1], z + plan.dz];
  await hold(action, WATER_BUCKET);
  // A bucket places water through ordinary item use. Block interaction
  // alone passes without placing the fluid.
  await action('look', { pitch: 90 });
  if (!(await action('use_item'))?.success) return false;
  // Wait for the water to reach the ground before committing to the drop.
  for (let check = 0; check < 100; check++) {
    const view = await action('get_blocks', { center: water, size: [1, 1, 1], format: 'json' });
    if (view?.cells.some(cell => cell.b === WATER)) break;
    if (check === 99) return false;
    await setTimeout(200);
  }
  const yaw = Math.atan2(-plan.dx, plan.dz) * 180 / Math.PI;
  await action('move', { forward: true, yaw, ticks: 6 });
  for (let wait = 0; wait < 60; wait++) {
    const landing = await action('observe');
    if (!landing?.inWorld || landing.dead) return false;
    if (landing.position.y <= plan.base[1] + 1) return leaveShallowWater(action, line);
    await setTimeout(240);
  }
  return false;
}

async function firingGround(action, crystal, plan) {
  const [x, y, z] = crystal.pos.map(Math.floor);
  const bottom = plan.base[1] - 6;
  const top = y + 5;
  const center = [x + plan.dx * 19, Math.floor((bottom + top + 1) / 2), z + plan.dz * 19];
  const size = plan.dx ? [49, top - bottom + 1, 25] : [25, top - bottom + 1, 49];
  const view = await action('get_blocks', { center, size, format: 'json' });
  if (!view || view.stats?.unloadedChunks) return null;
  const solid = new Set(view.cells.filter(cell => !/:(?:fire|soul_fire)$/.test(cell.b))
    .map(cell => `${cell.x},${cell.y},${cell.z}`));
  const [pillarX, pillarY, pillarZ] = plan.base;
  for (let height = pillarY; height < plan.top; height++) {
    solid.add(String([pillarX, height, pillarZ]));
    solid.add(String([pillarX + plan.dx, height, pillarZ + plan.dz]));
  }
  const opening = new Set(plan.bars.map(String));
  const dry = view.cells.filter(cell => (cell.x - x) * plan.dx + (cell.z - z) * plan.dz >= 14
    && Math.abs(cell.y + 1 - plan.base[1]) <= 5 && hasDrySupport(cell.b)
    && !solid.has(`${cell.x},${cell.y + 1},${cell.z}`)
    && !solid.has(`${cell.x},${cell.y + 2},${cell.z}`));
  const vantage = [x + plan.dx * 30, plan.base[1], z + plan.dz * 30];
  const candidates = dry.map(cell => [cell.x, cell.y + 1, cell.z])
    .sort((a, b) => horizontal(a, vantage) - horizontal(b, vantage));
  let first;
  for (const [x, y, z] of candidates) {
    const needed = new Set();
    const heights = [1, 1.5, 0.65, 1.75].filter(height => {
      const blockers = new Set();
      const target = [crystal.pos[0], crystal.pos[1] + height, crystal.pos[2]];
      const clear = [0, -0.35, 0.35].every(offset => clearBowArc({
        position: { x: x + 0.5 + plan.dz * offset, y, z: z + 0.5 + plan.dx * offset },
      }, target, pos => {
        const key = String(pos);
        if (!solid.has(key)) return false;
        if (!opening.has(key)) return true;
        blockers.add(key);
        return false;
      }));
      if (clear) for (const key of blockers) needed.add(key);
      return clear;
    });
    if (!heights.length) continue;
    const firing = { line: [x, y, z], heights, bars: plan.bars.filter(pos => needed.has(String(pos))) };
    if (heights.length >= 2) return firing;
    first ??= firing;
  }
  return first ?? null;
}

export async function openCrystalCage(action, player, crystal, dangerous) {
  const [x, y, z] = crystal.pos.map(Math.floor);
  const floor = Math.floor(player.position.y);
  const low = floor - 6;
  const high = y + 2;
  if (high - low >= 58 || high <= low) return null;
  const terrain = await action('get_blocks', { center: [x, Math.floor((high + low + 1) / 2), z],
    size: [15, high - low + 1, 15], format: 'json' });
  if (!terrain || terrain.stats?.unloadedChunks) return null;
  const plan = cageApproach(terrain.cells, crystal, player);
  if (!plan) return null;
  const firing = await firingGround(action, crystal, plan);
  if (!firing) return null;
  const { line, heights, bars } = firing;
  const stock = await action('get_inventory');
  const blocks = MATERIAL.find(item => stock.slots.reduce((sum, stack) =>
    sum + (stack.id === item ? stack.count : 0), 0) >= plan.top - plan.base[1]);
  const pickaxe = PICKAXE.find(item => stock.slots.some(stack => stack.id === item));
  if (!blocks || !pickaxe || !stock.slots.some(stack => stack.id === WATER_BUCKET)) return null;
  const visited = [];
  const rejected = new Set();
  for (let approach = 0; horizontal(feet(player), plan.base) > 1 && approach < 12; approach++) {
    if (player.health < 16 || await dangerous()) return null;
    visited.push(feet(player));
    if (!await stepOut(action, player, visited, plan.base, 'surface', rejected)) return null;
    player = await action('observe');
  }
  if (!(await action('go_to', { pos: plan.base, stopDistance: 0.3, maxTicks: 45 }))?.arrived) return null;
  player = await action('observe');
  if (!player.onGround || feet(player).join(',') !== plan.base.join(',')) return null;
  for (let adjust = 0; adjust < 4; adjust++) {
    const dx = plan.base[0] + 0.5 - player.position.x;
    const dz = plan.base[2] + 0.5 - player.position.z;
    if (Math.hypot(dx, dz) <= 0.2) break;
    await action('move', { forward: true, sneak: true, ticks: 2, yaw: Math.atan2(-dx, dz) * 180 / Math.PI });
    player = await action('observe');
    if (!player.onGround || feet(player).join(',') !== plan.base.join(',')) return null;
  }
  await hold(action, blocks);
  let opened = false;
  for (let height = plan.base[1]; height < plan.top; height++) {
    if (player.health < 16 || await dangerous()) break;
    const placed = await action('place_block', { pos: feet(player) });
    if (!placed?.placed) break;
    player = await action('observe');
    for (let settle = 0; !player.onGround && settle < 8; settle++) {
      await setTimeout(110);
      player = await action('observe');
    }
    if (!player.onGround || Math.floor(player.position.y) !== height + 1) break;
  }
  if (player.onGround && Math.floor(player.position.y) === plan.top && player.health >= 16 && !await dangerous()) {
    await hold(action, pickaxe);
    opened = true;
    for (const pos of bars) {
      const existing = await action('get_blocks', { center: pos, size: [1, 1, 1], format: 'json' });
      if (!existing?.cells.some(cell => cell.b === BARS)) continue;
      if (await dangerous() || !(await action('break_block', { pos, maxTicks: 75 }))?.broken) {
        opened = false;
        break;
      }
    }
  }
  player = await action('observe');
  if (!await descendWater(action, player, plan, line) || !opened) return null;
  return { line, heights };
}
