const assert = require('node:assert/strict');
const test = require('node:test');

function platform() {
  return Array.from({ length: 25 }, (_, i) =>
    ({ x: 98 + i % 5, y: 48, z: -2 + Math.floor(i / 5), b: 'minecraft:obsidian' }));
}

test('End camp leaves clearance for a dog standing across block boundaries', async () => {
  const { planEndCamp } = await import('./expedition-end-camp.mjs');
  const cells = platform();
  cells.push({ x: 102, y: 49, z: 1, b: 'minecraft:cave_air' });
  const camp = planEndCamp(cells, [101.1, 49, 1.1], [100, 49, 0]);
  assert.ok(camp);
  assert.ok([[102, 49, 1], [101, 49, 2]].some(pos => String(pos) === String(camp.mat)));
  assert.ok(camp.placements.some(pos => String(pos) === '101,51,1'));
  assert.ok(camp.placements.some(pos => String(pos) === String([camp.mat[0], 51, camp.mat[2]])));
  assert.ok(!camp.placements.some(pos => pos[1] < 51 && pos[0] <= 101 && pos[2] <= 1));
});

test('End camp rejects a mat over the void and construction on an isolated foothold', async () => {
  const { planEndCamp } = await import('./expedition-end-camp.mjs');
  const cells = [{ x: 101, y: 48, z: 1, b: 'minecraft:obsidian' }];
  assert.equal(planEndCamp(cells, [101.5, 49, 1.5], [101, 49, 1]), null);
});
