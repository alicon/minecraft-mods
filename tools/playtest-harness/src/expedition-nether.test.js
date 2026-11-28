const assert = require('node:assert/strict');
const test = require('node:test');

function portalCells(axis, missing) {
  const at = (along, y, normal, b) => axis === 'x' ? { x: along, y, z: normal, b } : { x: normal, y, z: along, b };
  const frame = [[0, -1], [1, -1], [-1, 0], [2, 0], [-1, 1], [2, 1], [-1, 2], [2, 2], [0, 3], [1, 3]];
  return [
    ...frame.filter(([along, y]) => !missing || `${along},${y}` !== String(missing))
      .map(([along, y]) => at(along, y, 0, 'minecraft:obsidian')),
    ...[-3, -2, -1, 1, 2, 3].map(normal => at(0, -1, normal, 'minecraft:cobblestone')),
  ];
}

test('portal search matches both axes, budgets the exact repair and selects a dry landing', async () => {
  const { findPortalFrame } = await import('./expedition-nether.mjs');
  for (const axis of ['x', 'z']) {
    const cells = portalCells(axis, [-1, 2]);
    const player = axis === 'x' ? { x: 0.5, y: 0, z: 4.5 } : { x: 4.5, y: 0, z: 0.5 };
    assert.equal(findPortalFrame(cells, player), undefined);
    assert.deepEqual(findPortalFrame(cells, player, 1), {
      axis, lit: false, opening: [0, 0, 0], missing: [axis === 'x' ? [-1, 2, 0] : [0, 2, -1]],
      landing: axis === 'x' ? [0, 0, 3] : [3, 0, 0],
    });
  }
});

test('portal search rejects crying obsidian and refuses a landing across lava or a drop', async () => {
  const { findPortalFrame } = await import('./expedition-nether.mjs');
  const player = { x: 0.5, y: 0, z: 4.5 };
  const cells = portalCells('x');
  const crying = cells.map(block => block.x === -1 && block.y === 2
    ? { ...block, b: 'minecraft:crying_obsidian' } : block);
  assert.equal(findPortalFrame(crying, player, 1), undefined);
  const blocked = cells.filter(block => !(block.y === -1 && block.z === -1));
  blocked.push({ x: 0, y: 0, z: 1, b: 'minecraft:lava' });
  assert.equal(findPortalFrame(blocked, player), undefined);
});
