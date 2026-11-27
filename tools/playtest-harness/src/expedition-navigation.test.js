const assert = require('node:assert/strict');
const test = require('node:test');

function cell(x, y, z, type = 'grass_block') {
  return { x, y, z, b: `minecraft:${type}` };
}

test('forest-floor litter can be cleared for a bed with two dry supports', async () => {
  const { bedSpotsWithGroundCover, nearbyBuildingSpots } = await import('./expedition-navigation.mjs');
  const position = { x: 0.15, y: 1, z: 0.5 };
  const blocks = [cell(1, 0, 0), cell(2, 0, 0), cell(1, 1, 0, 'leaf_litter'),
    cell(2, 1, 0, 'short_grass'), cell(1, 0, 1), cell(1, 1, 1, 'water')];
  assert.deepEqual(nearbyBuildingSpots(blocks, position, true), []);
  assert.deepEqual(bedSpotsWithGroundCover(blocks, position), [
    { pos: [1, 1, 0], clear: [[1, 1, 0], [2, 1, 0]] },
  ]);
});

test('a soil-covered quarry has a dry descending step without undermining camp', async () => {
  const { quarryStep } = await import('./expedition-navigation.mjs');
  const start = [0, 5, 0];
  const bed = [-3, 5, 0];
  const blocks = [
    cell(1, 5, 0, 'dirt'), cell(1, 4, 0), cell(1, 3, 0, 'stone'),
    cell(0, 4, 1, 'dirt'), cell(0, 3, 1, 'stone'), cell(0, 4, 2, 'water'),
    cell(-1, 4, 0, 'dirt'), cell(-1, 3, 0, 'stone'),
  ];
  assert.deepEqual(quarryStep(blocks, start, bed, []), {
    landing: [1, 4, 0], clear: [[1, 5, 0], [1, 4, 0]],
  });
  assert.equal(quarryStep(blocks, start, bed, [[1, 5, 0]]), null);
});

test('a horizontal arrival still waits for the player to land one block lower', async () => {
  const { settleQuarryStep } = await import('./expedition-home.mjs');
  const landing = [410, 68, 235];
  const reports = [
    { position: { x: 410.5, y: 69, z: 235.29 }, onGround: true, inWorld: true, health: 20 },
    { position: { x: 410.5, y: 68.6, z: 235.44 }, onGround: false, inWorld: true, health: 20 },
    { position: { x: 410.5, y: 68, z: 235.52 }, onGround: true, inWorld: true, health: 20 },
  ];
  const action = async name => {
    assert.equal(name, 'observe');
    return reports.shift();
  };
  assert.equal(await settleQuarryStep(action, landing, async () => {}), true);
  assert.equal(reports.length, 0);
});

test('a dry destination across water routes around the shore', async () => {
  const { dryWaypoint } = await import('./expedition-navigation.mjs');
  const blocks = [
    cell(0, 0, 0), cell(1, 0, 0), cell(1, 1, 0, 'water'), cell(2, 0, 0),
    cell(0, 0, 1), cell(1, 0, 1), cell(2, 0, 1),
  ];
  assert.deepEqual(dryWaypoint(blocks, [0, 1, 0], [], [2, 1, 0]), [0, 1, 1]);
});

test('an open stretch can run ten blocks while a trunk interrupts the segment', async () => {
  const { dryWaypoint } = await import('./expedition-navigation.mjs');
  const ground = Array.from({ length: 13 }, (_, x) => cell(x, 0, 0));
  const start = [0, 1, 0];
  const destination = [12, 1, 0];
  assert.deepEqual(dryWaypoint(ground, start, [], destination), [10, 1, 0]);
  const trees = [...ground, cell(7, 1, 0, 'oak_log'), cell(7, 2, 0, 'oak_log')];
  assert.deepEqual(dryWaypoint(trees, start, [], destination), [6, 1, 0]);
});

test('a two-block sand bank and a low ceiling both block the direct step', async () => {
  const { dryWaypoint } = await import('./expedition-navigation.mjs');
  const start = [0, 1, 0];
  const bank = [cell(0, 0, 0), cell(1, 0, 0), cell(1, 1, 0, 'sand'), cell(1, 2, 0, 'sand')];
  assert.equal(dryWaypoint(bank, start, []), null);
  assert.equal(dryWaypoint([...bank.slice(0, -1), cell(0, 3, 0, 'oak_leaves')], start, []), null);
  assert.deepEqual(dryWaypoint(bank.slice(0, -1), start, []), [1, 2, 0]);
});

test('an enclosed player can clear a leaf above solid ground', async () => {
  const { dryWaypoint, leavesBlockingExit } = await import('./expedition-navigation.mjs');
  const blocks = [
    cell(0, 0, 0), cell(1, 0, 0), cell(1, 1, 0, 'oak_leaves'), cell(1, 2, 0, 'oak_leaves'),
    cell(0, 0, 1, 'water'), cell(0, 2, 1, 'birch_leaves'),
  ];
  assert.equal(dryWaypoint(blocks, [0, 1, 0], [], [1, 1, 0]), null);
  assert.deepEqual(leavesBlockingExit(blocks, [0, 1, 0]), [1, 1, 0]);
  assert.deepEqual(leavesBlockingExit(blocks.filter(block => block.y !== 1), [0, 1, 0]), [1, 2, 0]);
});

test('bed placement finds a supported pair beyond a crowded immediate neighbor', async () => {
  const { nearbyBuildingSpots } = await import('./expedition-navigation.mjs');
  const position = { x: 0.05, y: 1, z: 0.4 };
  const blocks = [
    cell(0, 0, 0), cell(-1, 0, 0), cell(1, 0, 0), cell(1, 1, 0),
    cell(0, 0, -1), cell(0, 1, -1), cell(0, 0, 1), cell(0, 1, 1, 'crafting_table'),
    cell(0, 0, 2), cell(0, 0, 3),
  ];
  assert.deepEqual(nearbyBuildingSpots(blocks, position, true), [[0, 1, 2]]);
  assert.deepEqual(nearbyBuildingSpots([...blocks, cell(0, 2, 3)], position, true), []);
});

test('a predicted bed is incomplete until both adjacent halves appear in the loaded world', async () => {
  const { hasPlacedBed } = await import('./expedition-navigation.mjs');
  const foot = [290, 68, 222];
  const item = 'minecraft:white_bed';
  assert.equal(hasPlacedBed([], foot, item), false);
  assert.equal(hasPlacedBed([cell(...foot, 'white_bed'), cell(289, 68, 221, 'white_bed')], foot, item), false);
  assert.equal(hasPlacedBed([cell(...foot, 'white_bed'), cell(289, 68, 222, 'white_bed')], foot, item), true);
});

test('repeated backtracking toward inaccessible sheep gives way to exploring the dry bank', async () => {
  const { dryWaypoint } = await import('./expedition-navigation.mjs');
  const blocks = [cell(0, 0, 0), cell(1, 0, 0), cell(0, 0, 1), cell(0, 0, 2)];
  const start = [0, 1, 0];
  const sheep = [10, 1, 0];
  assert.deepEqual(dryWaypoint(blocks, start, [], sheep), [1, 1, 0]);
  assert.deepEqual(dryWaypoint(blocks, start, Array(4).fill([1, 1, 0]), sheep), [0, 1, 1]);
});

test('a step rejected by the native movement guard is excluded from the next approach', async () => {
  const { dryStepKey, dryWaypoint } = await import('./expedition-navigation.mjs');
  const start = [0, 1, 0];
  const blocks = [
    cell(0, 0, 0), cell(1, 1, 0, 'oak_leaves'), cell(2, 1, 0, 'oak_leaves'),
    cell(0, 0, 1), cell(1, 0, 1), cell(2, 0, 1),
  ];
  const sheep = [7, 2, 0];
  assert.deepEqual(dryWaypoint(blocks, start, [], sheep), [2, 2, 0]);
  const rejected = new Set([dryStepKey(start, [2, 2, 0])]);
  assert.deepEqual(dryWaypoint(blocks, start, [], sheep, false, rejected), [0, 1, 1]);
});

test('a sheep scout prefers observed open turf over equally reachable covered ground', async () => {
  const { dryWaypoint } = await import('./expedition-navigation.mjs');
  const blocks = [
    cell(0, 0, 0), cell(1, 0, 0), cell(2, 0, 0), cell(1, 3, 0, 'oak_leaves'),
    cell(0, 0, 1), cell(0, 0, 2), cell(1, 0, 2),
  ];
  assert.deepEqual(dryWaypoint(blocks, [0, 1, 0], [], undefined, true), [0, 1, 2]);
});
