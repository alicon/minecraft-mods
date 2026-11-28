const assert = require('node:assert/strict');
const test = require('node:test');

test('stronghold triangulation accepts forward intersections and rejects unstable bearings', async () => {
  const { intersectEyeBearings } = await import('./expedition-eye-route.mjs');
  const first = { origin: { x: 0, z: 0 }, bearing: { x: 0, z: 1 } };
  const normal = Math.hypot(16, 48);
  const second = { origin: { x: 16, z: 0 }, bearing: { x: -16 / normal, z: 48 / normal } };
  const result = intersectEyeBearings(first, second);
  assert.equal(result.x, 0);
  assert.ok(Math.abs(result.z - 48) < 0.001);
  assert.equal(intersectEyeBearings(first, { ...second, bearing: { x: 0.01, z: 1 } }), null);
  assert.equal(intersectEyeBearings(first, { ...second, bearing: { x: 16 / normal, z: -48 / normal } }), null);
});

const cell = (x, y, z, block) => ({ x, y, z, b: `minecraft:${block}` });
const frame = [-1, 0, 1].flatMap(i => [
  cell(-2, 64, i, 'end_portal_frame'), cell(2, 64, i, 'end_portal_frame'),
  cell(i, 64, -2, 'end_portal_frame'), cell(i, 64, 2, 'end_portal_frame'),
]);
const center = [0, 64, 0];
const player = { x: 0.5, y: 64, z: 4.5 };
const dryFloor = [cell(0, 63, 3, 'stone_bricks'), cell(3, 63, 0, 'stone_bricks')];
const water = cell(0, 64, 3, 'water');
const roof = cell(3, 66, 0, 'stone_bricks');

test('a stronghold bearing uses observed horizontal flight and ignores vertical motion', async () => {
  const { eyeBearing } = await import('./expedition-eye-route.mjs');
  assert.equal(eyeBearing([4, 62, 3], [4, 69, 3]), null);
  assert.deepEqual(eyeBearing([4, 62, 3], [1, 63, 7]), { x: -0.6, z: 0.8, distance: 5 });
});

test('End entry finds the full observed ring and sorts dry, unobstructed approaches by distance', async () => {
  const { findEndRing } = await import('./expedition-end-entry.mjs');
  const ring = findEndRing([...frame, ...dryFloor], player);
  assert.deepEqual(ring.center, center);
  assert.equal(ring.frame.length, 12);
  assert.deepEqual(ring.approaches, [[0, 64, 3], [3, 64, 0]]);
  assert.equal(ring.lit, false);
  assert.equal(findEndRing([...frame.slice(1), ...dryFloor], player), undefined);
  assert.equal(findEndRing([...frame, ...dryFloor, water, roof], player), undefined);
});

test('generated portal rooms expose lower interaction stances and a raised entry', async () => {
  const { findEndRing } = await import('./expedition-end-entry.mjs');
  const platform = [
    cell(-3, 64, 0, 'cracked_stone_bricks'),
    cell(0, 61, 3, 'mossy_stone_bricks'),
    cell(0, 62, 3, 'cave_air'),
  ];
  assert.deepEqual(findEndRing([...frame, ...platform], player).approaches, [[0, 62, 3], [-3, 65, 0]]);
});

test('End entry requires all nine vanilla portal blocks when deciding if it can cross', async () => {
  const { findEndRing } = await import('./expedition-end-entry.mjs');
  const portal = [-1, 0, 1].flatMap(x => [-1, 0, 1].map(z => cell(x, 64, z, 'end_portal')));
  assert.equal(findEndRing([...frame, ...dryFloor, ...portal.slice(1)], player), undefined);
  assert.equal(findEndRing([...frame, ...dryFloor, ...portal], player).lit, true);
});

test('the ore return trail contains grounded outbound observations and ends at the first ore pickup', async () => {
  const { firstIronOutboundTrail } = await import('./expedition-eye-route.mjs');
  const home = [0, 64, 0];
  const point = (x, changes = {}) => ({ action: 'observe', observation: {
    dimension: 'minecraft:overworld', onGround: true, position: { x, y: 64, z: 0.5 }, ...changes,
  } });
  const events = [point(0.5), point(6.5), point(12.5, { inWater: true }), point(16.5), point(6.5), point(13.5),
    { action: 'get_inventory', observation: { slots: [{ id: 'minecraft:raw_iron', count: 1 }] } }, point(88.5)];
  const trace = events.map(row => JSON.stringify(row)).join('\n{partial row\n') + '\n{"unfinished":';
  assert.deepEqual(firstIronOutboundTrail(trace, home), [[0, 64, 0], [6, 64, 0], [13, 64, 0]]);
});

test('a regroup trail starts from the last same-level contact with the original dog', async () => {
  const { companionRegroupTrail } = await import('./expedition-eye-route.mjs');
  const point = (x, y, z = 0.5) => ({ action: 'observe', observation: {
    dimension: 'minecraft:overworld', onGround: true, position: { x, y, z },
  } });
  const dog = (uuid, y, distance) => ({ action: 'get_entities', observation: {
    entities: [{ uuid, pos: [0.5, y, 0.5], health: 12, distance }],
  } });
  const trace = [
    point(0.5, 62), dog('original', 62, 1), point(2.5, 63), point(6.5, 66),
    dog('other', 66, 1), dog('original', 62, 5), point(9.5, 67), point(6.5, 66), point(6.5, 68, 3.5),
  ].map(row => JSON.stringify(row)).join('\n') + '\n{"incomplete":';
  assert.deepEqual(companionRegroupTrail(trace, 'original'), [
    [0, 62, 0], [2, 63, 0], [6, 66, 0], [6, 68, 3],
  ]);
});

test('the return to an expedition bed verifies the original living dog nearby', async () => {
  const { returnToCampWithCompanion } = await import('./expedition-eye-route.mjs');
  const home = [0, 64, 0];
  let position = { x: 8.5, y: 64, z: 0.5 };
  const moved = [];
  const action = async (name, args) => {
    switch (name) {
      case 'observe': return { inWorld: true, dimension: 'minecraft:overworld',
        onGround: true, health: 20, gameTime: 100, position };
      case 'get_entities': return { entities: [
        { uuid: 'different', health: 12, distance: 1, pos: [0.5, 64, 0.5] },
        { uuid: 'original', health: 9, distance: 2, pos: [position.x + 2, 64, 0.5] },
      ] };
      case 'get_blocks': return { cells: Array.from({ length: 12 }, (_, x) =>
        ({ x, y: 63, z: 0, b: 'minecraft:grass_block' })) };
      case 'go_to':
        moved.push(args.pos);
        position = { x: args.pos[0] + 0.5, y: args.pos[1], z: args.pos[2] + 0.5 };
        return { arrived: true, position: [position.x, position.y, position.z] };
      default: assert.fail(`Unexpected action: ${name}`);
    }
  };
  const returned = await returnToCampWithCompanion(action, 'original', home);
  assert.ok(moved.length > 0);
  assert.equal(returned.dog.uuid, 'original');
  assert.equal(returned.dog.health, 9);
  assert.ok(Math.abs(returned.owner.position.x - 0.5) <= 4);
});
