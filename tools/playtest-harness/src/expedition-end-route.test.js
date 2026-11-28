const assert = require('node:assert/strict');
const test = require('node:test');

const stone = 'minecraft:end_stone';
const camp = { shelter: [2, 1, 0], mat: [3, 1, 0] };
const start = [0, 1, 0];

function buriedPlatform() {
  const tiles = [];
  for (let x = -5; x <= 5; x++) {
    for (let z = -5; z <= 5; z++) {
      for (let y = 0; y <= 3; y++) {
        if (y > 0 && y < 3 && Math.abs(x) <= 2 && Math.abs(z) <= 2) continue;
        tiles.push({ x, y, z, b: stone });
      }
    }
  }
  return { origin: [-5, 0, -5], size: [11, 15, 11], cells: tiles, stats: { unloadedChunks: 0 } };
}

test('End route rises through observed stone while preserving the camp roof', async () => {
  const { planEndStairs } = await import('./expedition-end-route.mjs');
  const plan = planEndStairs(buriedPlatform(), start, camp);
  assert.ok(plan?.length >= 3);
  assert.ok(plan.at(-1).next[1] >= 3);
  let previous = start;
  for (const { next, clear } of plan) {
    assert.equal(Math.abs(next[0] - previous[0]) + Math.abs(next[2] - previous[2]), 1);
    assert.ok([0, 1].includes(next[1] - previous[1]));
    assert.ok(clear.every(([x, y, z]) => !(y <= 3 && [camp.shelter, camp.mat]
      .some(pos => Math.abs(x - pos[0]) + Math.abs(z - pos[2]) <= 1))));
    previous = next;
  }
});

test('End route rejects an unloaded survey and a platform with no supported exit', async () => {
  const { planEndStairs } = await import('./expedition-end-route.mjs');
  const surveyed = buriedPlatform();
  assert.equal(planEndStairs({ ...surveyed, stats: { unloadedChunks: 1 } }, start, camp), null);
  assert.equal(planEndStairs({ ...surveyed, cells: [{ x: 0, y: 0, z: 0, b: 'minecraft:obsidian' }] }, start, camp), null);
});
