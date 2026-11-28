import assert from 'node:assert/strict';
import { breakVisible, settleOnDryStep, stepOut } from './expedition-home.mjs';
import { hasDrySupport } from './expedition-navigation.mjs';

const END = 'minecraft:the_end';
const END_STONE = 'minecraft:end_stone';
const AIR = /^minecraft:(?:air|cave_air|void_air)$/;
const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const feet = ({ position }) => [position.x, position.y, position.z].map(Math.floor);
const offset = ([x, y, z], dx, dy, dz) => [x + dx, y + dy, z + dz];
const above = (pos, dy) => offset(pos, 0, dy, 0);

export function planEndStairs(area, start, camp) {
  if (!area || area.stats?.unloadedChunks) return null;
  const blocks = new Map(area.cells.filter(({ b }) => !AIR.test(b))
    .map(({ x, y, z, b }) => [String([x, y, z]), b]));
  const inside = pos => pos.every((axis, i) => axis >= area.origin[i] && axis < area.origin[i] + area.size[i]);
  const at = (pos, cleared) => inside(pos) ? cleared.has(String(pos)) ? undefined : blocks.get(String(pos)) : null;
  const roofLimit = area.origin[1] + area.size[1] - 1;
  const exposed = (pos, cleared) => {
    if (at(above(pos, -1), cleared) !== END_STONE || pos[1] + 6 > roofLimit) return false;
    for (let y = pos[1]; y <= roofLimit; y++) {
      if (at([pos[0], y, pos[2]], cleared) !== undefined) return false;
    }
    return true;
  };
  const sheltered = pos => [camp.shelter, camp.mat].some(([x, y, z]) =>
    Math.abs(pos[0] - x) + Math.abs(pos[2] - z) <= 1 && pos[1] <= y + 2);
  const queue = [{ pos: start, path: [], cleared: new Set() }];
  const seen = new Set([String(start)]);
  for (const { pos, path, cleared } of queue) {
    if (exposed(pos, cleared) && SIDES.filter(([dx, dz]) => [-1, 0, 1]
      .some(dy => exposed(offset(pos, dx, dy, dz), cleared))).length >= 2) return path;
    if (path.length >= 32) continue;
    for (const [dx, dz] of SIDES) {
      for (const rise of [1, 0]) {
        const next = offset(pos, dx, rise, dz);
        const key = String(next);
        if (seen.has(key) || !hasDrySupport(at(above(next, -1), cleared))) continue;
        // On a level cut the head-height block can hide the lower face from
        // the player's eye line. Open it before aiming at the feet.
        const spaces = rise ? [above(pos, 2), next, above(next, 1)] : [above(next, 1), next];
        const clear = spaces.filter(p => at(p, cleared) !== undefined);
        if (clear.some(p => at(p, cleared) !== END_STONE || sheltered(p))) continue;
        const opened = new Set([...cleared, ...clear.map(String)]);
        queue.push({ pos: next, path: [...path, { next, clear }], cleared: opened });
        seen.add(key);
      }
    }
  }
  return null;
}

async function walkStair(action, tile) {
  const moved = await action('go_to', { pos: tile, stopDistance: 0.3, maxTicks: 40 });
  assert.ok(moved?.arrived && await settleOnDryStep(action, tile),
    `The player did not reach the supported End stair at ${tile}: ${moved?.reason ?? moved?.error ?? 'landing unverified'}`);
}

export async function reachEndIslandSurface(action, camp, report, trail = [], recordStep = async () => {}) {
  const player = await action('observe');
  assert.ok(player?.dimension === END && player.onGround && player.health >= 12, 'End route needs a living, grounded player');
  const start = feet(player);
  const area = await action('get_blocks', { center: above(start, 14), size: [19, 39, 19], format: 'json' });
  const stairs = planEndStairs(area, start, camp);
  assert.ok(stairs, 'Could not find a stair to exposed End stone on the observed island');
  if (!trail.length || String(trail.at(-1)) !== String(start)) {
    const last = trail.at(-1);
    assert.ok(!last || last.reduce((sum, axis, i) => sum + Math.abs(axis - start[i]), 0) <= 2,
      'The player moved away from the recorded End staircase');
    trail.push(start);
    await recordStep();
  }
  for (const { next, clear } of stairs) {
    for (const pos of clear) {
      const broken = await breakVisible(action, pos);
      assert.ok(broken?.broken && broken.block === END_STONE, `Could not excavate End stone at ${pos}`);
    }
    await walkStair(action, next);
    trail.push(next);
    await recordStep();
  }
  await report('surface', { trail });
  return trail;
}

export async function approachEndTrail(action, start) {
  const visited = [];
  const rejected = new Set();
  for (let attempt = 0; attempt < 48; attempt++) {
    const player = await action('observe');
    if (String(feet(player)) === String(start) && player.onGround) return;
    visited.push(feet(player));
    const near = Math.hypot(player.position.x - start[0] - 0.5, player.position.z - start[2] - 0.5) <= 2;
    if (near && (await action('go_to', { pos: start, stopDistance: 0.3, maxTicks: 35 }))?.arrived
        && await settleOnDryStep(action, start)) return;
    await stepOut(action, player, visited.slice(-24), start, 'surface', rejected, undefined, undefined, 40);
  }
  throw new Error('Could not return to the observed surface entrance of the End camp');
}

export async function walkBackToEndCamp(action, trail) {
  const player = await action('observe');
  assert.equal(String(feet(player)), String(trail.at(-1)), 'The player must reach the surface trail before descending');
  for (const tile of trail.slice(0, -1).reverse()) await walkStair(action, tile);
}

export async function climbEndTrailWithCompanion(action, trail, waitForCompanion) {
  await approachEndTrail(action, trail[0]);
  for (const [index, tile] of trail.entries()) {
    if (index > 0) await walkStair(action, tile);
    if (index % 3 === 0 || index === trail.length - 1) await waitForCompanion();
  }
}
