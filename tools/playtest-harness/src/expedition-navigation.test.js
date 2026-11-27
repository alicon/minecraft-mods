const assert = require('node:assert/strict');
const test = require('node:test');

function cell(x, y, z, type = 'grass_block') {
  return { x, y, z, b: `minecraft:${type}` };
}

test('a fire interruption stops further mining and walks away from the lava', async () => {
  const { mineVisible } = await import('./expedition-home.mjs');
  const positions = [];
  let attempts = 0;
  let target;
  let player = { inWorld: true, health: 9, position: { x: 0.5, y: 1, z: 0.5 } };
  const action = async (name, args) => {
    switch (name) {
      case 'observe': return { ...player, crosshair: { pos: target } };
      case 'get_blocks': return { cells: args.size[0] === 11
        ? [cell(1, 1, 0, 'stone'), cell(2, 1, 0, 'stone'), cell(-2, 0, 0, 'lava')]
        : Array.from({ length: 10 }, (_, x) => cell(x, 0, 0)) };
      case 'get_inventory': return { slots: [] };
      case 'look':
        target = args.at;
        return {};
      case 'break_block':
        attempts++;
        player = { ...player, health: 8 };
        return { broken: false, reason: 'interrupted: took damage from fire (health 8.0)' };
      case 'go_to': {
        const [x, y, z] = args.pos;
        positions.push(args.pos);
        player = { ...player, position: { x: x + 0.5, y, z: z + 0.5 } };
        return { arrived: true };
      }
      default: throw new Error(`Unexpected action: ${name}`);
    }
  };
  assert.equal(await mineVisible(action, [50, 1, 0], new Set(),
    new Set(['minecraft:stone']), new Set(['minecraft:cobblestone'])), false);
  assert.equal(attempts, 1);
  assert.deepEqual(positions, [[7, 1, 0]]);
});

test('breaking an ore without picking up its drop does not count as mining progress', async () => {
  const { mineVisible } = await import('./expedition-home.mjs');
  let breaks = 0;
  const action = async name => {
    switch (name) {
      case 'observe': return { inWorld: true, health: 20, position: { x: 0.5, y: 1, z: 0.5 }, crosshair: { pos: [1, 1, 0] } };
      case 'get_blocks': return { cells: [cell(1, 1, 0, 'iron_ore')] };
      case 'get_inventory': return { slots: [] };
      case 'look': return {};
      case 'break_block':
        breaks++;
        return { broken: true };
      case 'get_entities': return { entities: [] };
      default: throw new Error(`Unexpected action: ${name}`);
    }
  };
  assert.equal(await mineVisible(action, [50, 1, 0], new Set(),
    new Set(['minecraft:iron_ore']), new Set(['minecraft:raw_iron'])), false);
  assert.equal(breaks, 1);
});

test('a route to an elevated camp climbs instead of stopping directly below it', async () => {
  const { dryWaypoint } = await import('./expedition-navigation.mjs');
  const terrain = [
    cell(0, 0, 0), cell(1, 0, 0), cell(2, 0, 0),
    cell(0, 1, 1), cell(1, 2, 1), cell(2, 3, 1), cell(2, 3, 0),
  ];
  assert.deepEqual(dryWaypoint(terrain, [0, 1, 0], [], [2, 4, 0]), [0, 2, 1]);
});

test('the respawn route picks up the original dropped guide before the remaining gear', async () => {
  const { recoverDroppedLoadout } = await import('./expedition-home.mjs');
  const guide = 'mushroom_yorkie:field_guide';
  const picked = [];
  const action = async (name, args) => {
    switch (name) {
      case 'observe': return { inWorld: true, health: 20, position: { x: 11.5, y: 64, z: 10.5 } };
      case 'get_entities': return { entities: [
        { id: 10, item: { id: 'minecraft:stone_pickaxe' }, pos: [10.2, 64, 10] },
        { id: 11, item: { id: guide }, pos: [10.8, 64, 10] },
        { id: 12, item: { id: 'minecraft:coal' }, pos: [11, 61, 11] },
      ] };
      case 'go_to':
        picked.push(args.entityId);
        return { arrived: true };
      case 'get_inventory': return { slots: picked.includes(11) ? [{ id: guide, count: 1 }] : [] };
      default: throw new Error(`Unexpected action: ${name}`);
    }
  };
  await recoverDroppedLoadout(action, [10, 64, 10]);
  assert.deepEqual(picked, [11, 10]);
});

test('a gear recovery with low health stops before approaching the old death location', async () => {
  const { recoverDroppedLoadout } = await import('./expedition-home.mjs');
  await assert.rejects(recoverDroppedLoadout(async name => {
    assert.equal(name, 'observe');
    return { inWorld: true, health: 5, position: { x: 11.5, y: 64, z: 10.5 } };
  }, [10, 64, 10]), /return to the dropped gear became unsafe/);
});

test('feeding only succeeds when the original dog is reached and consumes one meal', async () => {
  const { feedAdoptedDog } = await import('./expedition-home.mjs');
  for (const hit of [19, 22]) {
    let count = 2;
    const dog = { id: 22, distance: 2, pos: [2, 64, 0] };
    const action = async (name, args) => {
      switch (name) {
        case 'observe': return { position: { x: 0, y: 64, z: 0 }, crosshair: { id: hit } };
        case 'get_entities': return { entities: [dog] };
        case 'get_inventory': return { mainHand: { id: 'minecraft:mutton' }, slots: [{ id: 'minecraft:mutton', count }] };
        case 'look':
          assert.equal(args.entityId, dog.id);
          return {};
        case 'interact_entity':
          assert.equal(args.entityId, dog.id);
          count--;
          return {};
        default: throw new Error(`Unexpected action: ${name}`);
      }
    };
    assert.equal(await feedAdoptedDog(action, dog.id, [0, 64, 0], 1), hit === dog.id);
    assert.equal(count, hit === dog.id ? 1 : 2);
  }
});

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

test('reattaching after the iron kit was earned does not start mining again', async () => {
  const { earnIronKit } = await import('./expedition-home.mjs');
  const calls = [];
  const action = async name => {
    calls.push(name);
    return { slots: ['iron_pickaxe', 'bucket', 'shield'].map(item => ({ id: `minecraft:${item}`, count: 1 })) };
  };
  await earnIronKit(action, () => assert.fail('kit is already earned'), { bed: [0, 60, 0] });
  assert.deepEqual(calls, ['get_inventory']);
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
  assert.deepEqual(dryWaypoint(blocks, [0, 1, 0], [], undefined, 'grass'), [0, 1, 2]);
});
