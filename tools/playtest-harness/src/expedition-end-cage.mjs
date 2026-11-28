import { setTimeout } from 'node:timers/promises';
import { hold, stepOut } from './expedition-home.mjs';
import { hasDrySupport } from './expedition-navigation.mjs';

const BARS = 'minecraft:iron_bars';
const MATERIAL = ['minecraft:cobblestone', 'minecraft:end_stone', 'minecraft:dirt'];
const PICKAXE = ['netherite', 'diamond', 'iron', 'stone'].map(tier => `minecraft:${tier}_pickaxe`);
const WATER = 'minecraft:water';
const WATER_BUCKET = 'minecraft:water_bucket';
const SIDES = [[1, 0, 'east'], [-1, 0, 'west'], [0, 1, 'south'], [0, -1, 'north']];
const feet = ({ position }) => [position.x, position.y, position.z].map(Math.floor);
const horizontal = ([ax, , az], [bx, , bz]) => Math.hypot(ax - bx, az - bz);

export function cageApproach(cells, crystal, player) {
  const [x, y, z] = crystal.pos.map(Math.floor);
  const here = feet(player);
  const blocks = new Map(cells.map(cell => [`${cell.x},${cell.y},${cell.z}`, cell.b]));
  const block = (x, y, z) => blocks.get(`${x},${y},${z}`);
  const approaches = [];
  for (const [dx, dz, face] of SIDES) {
    const bars = [-1, 0, 1].map(offset => [x + dx * 2, y + offset, z + dz * 2]);
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
          approaches.push({ base: [baseX, baseY, baseZ], top, face, dx, dz, bars });
          break;
        }
      }
    }
  }
  return approaches.sort((a, b) => horizontal(a.base, here) - horizontal(b.base, here)
    || Math.abs(a.base[1] - here[1]) - Math.abs(b.base[1] - here[1]))[0];
}

async function descendWater(action, player, plan) {
  const [x, y, z] = feet(player);
  if (y <= plan.base[1] + 1) return true;
  const support = [x, y - 1, z];
  const water = [x + plan.dx, plan.base[1], z + plan.dz];
  await hold(action, WATER_BUCKET);
  await action('interact_block', { pos: support, face: plan.face });
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
    if (landing.position.y <= plan.base[1] + 1) return true;
    await setTimeout(240);
  }
  return false;
}

async function firingGround(action, crystal, plan) {
  const [x, , z] = crystal.pos.map(Math.floor);
  const center = [x + plan.dx * 32, plan.base[1], z + plan.dz * 32];
  const size = plan.dx ? [19, 13, 1] : [1, 13, 19];
  const view = await action('get_blocks', { center, size, format: 'json' });
  if (!view || view.stats?.unloadedChunks) return null;
  const solid = new Set(view.cells.map(cell => `${cell.x},${cell.y},${cell.z}`));
  const dry = view.cells.filter(cell => hasDrySupport(cell.b)
    && !solid.has(`${cell.x},${cell.y + 1},${cell.z}`)
    && !solid.has(`${cell.x},${cell.y + 2},${cell.z}`));
  return dry.map(cell => [cell.x, cell.y + 1, cell.z])
    .sort((a, b) => horizontal(a, center) - horizontal(b, center) || b[1] - a[1])[0] ?? null;
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
  const line = await firingGround(action, crystal, plan);
  if (!line) return null;
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
  if (!(await action('go_to', { pos: plan.base, stopDistance: 0.12, maxTicks: 45 }))?.arrived) return null;
  player = await action('observe');
  if (!player.onGround || feet(player).join(',') !== plan.base.join(',')) return null;
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
    for (const pos of plan.bars) {
      const existing = await action('get_blocks', { center: pos, size: [1, 1, 1], format: 'json' });
      if (!existing?.cells.some(cell => cell.b === BARS)) continue;
      if (await dangerous() || !(await action('break_block', { pos, maxTicks: 75 }))?.broken) {
        opened = false;
        break;
      }
    }
  }
  player = await action('observe');
  if (!await descendWater(action, player, plan) || !opened) return null;
  return line;
}
