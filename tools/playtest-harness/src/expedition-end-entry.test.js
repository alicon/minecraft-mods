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

test('the single-eye replay walks in the observed direction with the original dog', async () => {
  const { scoutByEye } = await import('./expedition-eye-route.mjs');
  const eye = { uuid: 'thrown-eye', pos: [0, 65, 0] };
  const ground = Array.from({ length: 12 }, (_, x) => cell(x, 63, 0, 'grass_block'));
  const readings = [];
  let position = { x: 0.5, y: 64, z: 0.5 };
  let flight;
  const action = async (name, args) => {
    switch (name) {
      case 'observe': return { inWorld: true, dimension: 'minecraft:overworld', health: 20, onGround: true, position };
      case 'get_inventory': return { slots: [{ slot: 0, id: 'minecraft:ender_eye', count: 1 }] };
      case 'select_slot': return { mainHand: { id: 'minecraft:ender_eye' } };
      case 'look': return {};
      case 'use_item': flight = 0; return {};
      case 'get_entities':
        if (args.type === 'minecraft:eye_of_ender') {
          return { entities: flight === undefined ? [] : [{ ...eye, pos: [flight++ * 5, 65, 0] }] };
        }
        return { entities: [{ uuid: 'original', health: 12 }] };
      case 'get_blocks': return { cells: ground };
      case 'go_to':
        position = { x: args.pos[0] + 0.5, y: args.pos[1], z: args.pos[2] + 0.5 };
        return { arrived: true, position: [position.x, position.y, position.z] };
      default: assert.fail(name);
    }
  };
  await scoutByEye(action, 'original', reading => readings.push(reading));
  assert.deepEqual(readings, [{ x: 1, z: 0, distance: 5, eye: eye.uuid }]);
  assert.ok(position.x >= 8.5);
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
  const { campOutboundTrail } = await import('./expedition-eye-route.mjs');
  const home = [0, 64, 0];
  const point = (x, changes = {}) => ({ action: 'observe', observation: {
    dimension: 'minecraft:overworld', onGround: true, position: { x, y: 64, z: 0.5 }, ...changes,
  } });
  const events = [point(0.5), point(6.5), point(12.5, { inWater: true }), point(16.5), point(6.5), point(13.5),
    { action: 'get_inventory', observation: { slots: [{ id: 'minecraft:raw_iron', count: 1 }] } }, point(88.5)];
  const trace = events.map(row => JSON.stringify(row)).join('\n{partial row\n') + '\n{"unfinished":';
  const waypoints = [[0, 64, 0], [6, 64, 0], [13, 64, 0]];
  assert.deepEqual(campOutboundTrail(trace, home, { beforeIron: true }), waypoints);
  assert.deepEqual(campOutboundTrail(trace, home), [...waypoints, [88, 64, 0]]);
});

test('the camp return drops quarry excursions when the player revisits the same ground', async () => {
  const { campOutboundTrail } = await import('./expedition-eye-route.mjs');
  const bed = [-180, 71, -90];
  const surface = [-62, 72, -67];
  const oldExit = [-39, 70, -56];
  const last = [-53, 64, -59];
  const rows = [bed, [-66, 73, -73], surface, [-51, 72, -78], oldExit,
    [-39, 65, -54], [-47, 71, -57], [-61, 72, -65], last].map(([x, y, z]) => JSON.stringify({
    action: 'observe',
    observation: { onGround: true, dimension: 'minecraft:overworld', position: { x, y, z } },
  }));
  assert.deepEqual(campOutboundTrail(rows.join('\n') + '\n', bed), [bed, [-66, 73, -73], surface, last]);
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
      case 'get_blocks': return { cells: Array.from({ length: 26 }, (_, x) =>
        ({ x, y: 63, z: 0, b: 'minecraft:grass_block' })) };
      case 'go_to':
        moved.push(args.pos);
        position = { x: args.pos[0] + 0.5, y: args.pos[1], z: args.pos[2] + 0.5 };
        return { arrived: true, position: [position.x, position.y, position.z] };
      default: assert.fail(`Unexpected action: ${name}`);
    }
  };
  const outbound = [home, [6, 64, 0], [23, 64, 0], [8, 64, 0]];
  const returned = await returnToCampWithCompanion(action, 'original', home, outbound);
  assert.ok(moved.length > 0);
  assert.ok(moved.every(pos => pos[0] <= 8), 'An old outbound errand should not pull the player away from camp');
  assert.equal(returned.dog.uuid, 'original');
  assert.equal(returned.dog.health, 9);
  assert.ok(Math.abs(returned.owner.position.x - 0.5) <= 4);
});

test('a camp return can climb out of a dry shelf with the original dog', async t => {
  for (const lowerExit of [false, true]) {
    await t.test(lowerExit ? 'the only open step leads back down' : 'there is no open step', async () => {
      const { returnToCampWithCompanion } = await import('./expedition-eye-route.mjs');
      const bed = [8, 66, 0];
      const headroom = [1, 65, 0];
      const step = [1, 64, 0];
      const pick = { id: 'minecraft:stone_pickaxe', slot: 0, count: 1, maxDamage: 131 };
      const base = [cell(0, 62, 0, 'stone'), cell(1, 63, 0, 'stone'), cell(2, 64, 0, 'stone'),
        ...Array.from({ length: 6 }, (_, x) => cell(x + 3, 65, 0, 'stone'))];
      if (lowerExit) base.push(cell(-1, 61, 0, 'stone'));
      const remaining = new Set([String(headroom), String(step)]);
      const broken = [];
      let walks = 0;
      let position = { x: 0.5, y: 63, z: 0.5 };
      let aimed;
      const action = async (name, args) => {
        switch (name) {
          case 'observe': return { inWorld: true, dimension: 'minecraft:overworld', onGround: true, health: 20,
            gameTime: 100, position, crosshair: aimed && { pos: aimed, block: 'minecraft:stone' } };
          case 'get_entities': return { entities: [{ uuid: 'original', health: 12, distance: 1,
            pos: [position.x, position.y, position.z + 1] }] };
          case 'get_inventory': return { slots: [pick], mainHand: pick };
          case 'get_blocks': return { cells: [...base, ...[headroom, step].filter(pos => remaining.has(String(pos)))
            .map(([x, y, z]) => cell(x, y, z, 'stone'))] };
          case 'look': aimed = args.at; return {};
          case 'break_block':
            assert.ok(remaining.delete(String(args.pos)));
            broken.push(args.pos);
            return { broken: true };
          case 'go_to':
            assert.ok(++walks <= 14, 'The player kept walking between the same two shelves');
            position = { x: args.pos[0] + 0.5, y: args.pos[1], z: args.pos[2] + 0.5 };
            return { arrived: true, position: Object.values(position) };
          default: assert.fail(name);
        }
      };
      const { owner, dog } = await returnToCampWithCompanion(action, 'original', bed);
      assert.deepEqual(broken, [headroom, step]);
      assert.equal(owner.position.y, 66);
      assert.equal(dog.uuid, 'original');
    });
  }
});

test('an unfinished care return reaches the bed with an injured dog even without ore or food', async () => {
  const { returnToCampWithCompanion } = await import('./expedition-eye-route.mjs');
  const { earnIronKit } = await import('./expedition-home.mjs');
  const bed = [0, 64, 0];
  let position = { x: 8.5, y: 64, z: 0.5 };
  let walkLimit;
  let returned;
  const action = async (name, args) => {
    switch (name) {
      case 'observe': return { inWorld: true, dimension: 'minecraft:overworld',
        onGround: true, health: 20, timeOfDay: 1_000, gameTime: 1_000, position };
      case 'get_inventory':
        assert.ok(returned || walkLimit === undefined, 'Inventory checked for mining before the care return');
        return { slots: returned ? [{ id: 'minecraft:iron_pickaxe', count: 1 },
          { id: 'minecraft:bucket', count: 1 }, { id: 'minecraft:shield', count: 1 }] : [] };
      case 'get_entities':
        return { entities: [{ uuid: 'original', health: 4, distance: 1, pos: [position.x + 1, 64, 0.5] }] };
      case 'get_blocks': return { cells: Array.from({ length: 12 }, (_, x) =>
        ({ x, y: 63, z: 0, b: 'minecraft:grass_block' })) };
      case 'go_to':
        walkLimit = args.maxTicks;
        position = { x: args.pos[0] + 0.5, y: args.pos[1], z: args.pos[2] + 0.5 };
        return { arrived: true, position: [position.x, position.y, position.z] };
      default: assert.fail(`Unexpected action: ${name}`);
    }
  };
  await earnIronKit(action, () => assert.fail('The player already has the iron kit'), { bed }, {
    returningAfterCare: true,
    returnAfterCare: async () => {
      returned = await returnToCampWithCompanion(action, 'original', bed, [], { report: () => {} });
    },
  });
  assert.equal(walkLimit, 40);
  assert.equal(returned.dog.uuid, 'original');
  assert.equal(returned.dog.health, 4);
  assert.ok(Math.abs(returned.owner.position.x - 0.5) <= 4);
});

test('a nighttime care return turns back to an injured dog beyond the ordinary survey radius', async () => {
  const { returnToCampWithCompanion } = await import('./expedition-eye-route.mjs');
  const bed = [50, 64, 0];
  const ground = Array.from({ length: 51 }, (_, x) => cell(x, 63, 0, 'grass_block'));
  const messages = [];
  const walked = [];
  let position = { x: 30.5, y: 64, z: 0.5 };
  let joined = false;
  const action = async (name, args) => {
    switch (name) {
      case 'observe': return { inWorld: true, dimension: 'minecraft:overworld', onGround: true, health: 9,
        position, timeOfDay: joined ? 1_000 : 18_000, gameTime: 24_000 + walked.length * 45 };
      case 'get_entities': {
        const dogX = joined ? position.x - 1 : 0.5;
        const dog = { uuid: 'original', health: 2, distance: Math.abs(dogX - position.x), pos: [dogX, 64, 0.5] };
        return { entities: dog.distance <= args.radius ? [dog] : [] };
      }
      case 'get_inventory': return { slots: [] };
      case 'get_blocks': return { cells: ground };
      case 'go_to':
        assert.ok(joined || args.pos[0] < position.x, 'The owner walked toward camp before regrouping');
        walked.push(args.pos[0]);
        position = { x: args.pos[0] + 0.5, y: args.pos[1], z: args.pos[2] + 0.5 };
        if (position.x <= 6.5) joined = true;
        return { arrived: true, position: [position.x, position.y, position.z] };
      default: assert.fail(`Unexpected action: ${name}`);
    }
  };
  const result = await returnToCampWithCompanion(action, 'original', bed, [], { report: message => messages.push(message) });
  assert.ok(walked[0] < 30);
  assert.ok(joined);
  assert.equal(result.dog.uuid, 'original');
  assert.equal(result.dog.health, 2);
  assert.ok(result.owner.position.x >= 46.5);
  assert.match(messages[0], /Regroup/);
  assert.match(messages[1], /back within reach/);
});

test('a stronghold descent recognizes a dry doorway but refuses flooded masonry', async () => {
  const { strongholdEntrance } = await import('./expedition-end-entry.mjs');
  const from = [0, 58, 0];
  const roof = [cell(1, 61, 0, 'stone_bricks'), cell(2, 61, 0, 'stone_bricks')];
  const floor = [cell(0, 57, 0, 'stone'), cell(1, 57, 0, 'stone_bricks'), cell(2, 57, 0, 'stone_bricks'), ...roof];
  assert.deepEqual(strongholdEntrance(floor, from), { entry: [1, 58, 0], landing: [1, 58, 0] });
  assert.equal(strongholdEntrance([cell(0, 57, 0, 'stone_bricks'), cell(1, 58, 0, 'stone_bricks')], from), null);
  const wall = [cell(1, 58, 0, 'stone_bricks'), cell(1, 59, 0, 'stone_bricks')];
  assert.deepEqual(strongholdEntrance([...floor, ...wall], from), {
    landing: [1, 58, 0], entry: [2, 58, 0], clear: [[1, 59, 0], [1, 58, 0]],
  });
  const flood = cell(2, 58, 0, 'lava');
  assert.equal(strongholdEntrance([...floor, ...wall, flood], from), null);
  assert.equal(strongholdEntrance([...floor, cell(1, 58, 0, 'infested_stone_bricks'), cell(1, 59, 0, 'stone_bricks')], from), null);
});

test('a descending stair favors the observed Eye fix and rejects a failed footing', async () => {
  const { quarryStep } = await import('./expedition-navigation.mjs');
  const from = [0, 64, 0];
  const terrain = [-1, 1].flatMap(x => [62, 63, 64].map(y => cell(x, y, 0, 'stone')));
  const options = { toward: [-5, 64, 0], rejected: new Set() };
  assert.deepEqual(quarryStep(terrain, from, undefined, [], options).landing, [-1, 63, 0]);
  options.rejected.add('-1,63,0');
  assert.deepEqual(quarryStep(terrain, from, undefined, [], options).landing, [1, 63, 0]);
});

test('the stronghold route allows a checked three-block descent through masonry', async () => {
  const { quarryStep } = await import('./expedition-navigation.mjs');
  const from = [0, 64, 0];
  const stone = [cell(1, 60, 0, 'stone_bricks'), cell(1, 63, 0, 'stone_bricks'), cell(1, 64, 0, 'stone')];
  const options = { toward: [1, 64, 0], masonry: true };
  assert.deepEqual(quarryStep(stone, from, undefined, [], options), {
    landing: [1, 61, 0], clear: [[1, 64, 0], [1, 63, 0]],
  });
  assert.equal(quarryStep([...stone, cell(2, 62, 0, 'lava')], from, undefined, [], options), null);
});

test('portal routing accepts a longer dry route to any reachable approach', async () => {
  const { dryWaypoint } = await import('./expedition-navigation.mjs');
  const from = [0, 64, 0];
  const floor = [cell(0, 63, 0, 'stone_bricks'), cell(1, 63, 0, 'stone_bricks'), cell(2, 63, 0, 'stone_bricks'),
    cell(-1, 63, 0, 'stone_bricks'), cell(-2, 63, 0, 'stone_bricks'), cell(-2, 63, 1, 'stone_bricks')];
  const wall = [cell(1, 64, 0, 'stone_bricks'), cell(1, 65, 0, 'stone_bricks')];
  const route = targets => dryWaypoint([...floor, ...wall], from, [], undefined, 'stronghold', new Set(), undefined, targets);
  assert.deepEqual(route([[2, 64, 0], [-2, 64, 1]]), [-2, 64, 0]);
  assert.equal(route([[2, 64, 0]]), null);
});

test('a solid corridor wall is opened only if it connects two dry routes to the portal', async () => {
  const { strongholdPassage } = await import('./expedition-end-entry.mjs');
  const from = [0, 64, 0];
  const wanted = [[0, 64, 3]];
  const floor = [0, 1, 2, 3].map(z => cell(0, 63, z, 'stone_bricks'));
  const wall = [cell(0, 64, 1, 'mossy_stone_bricks'), cell(0, 65, 1, 'stone_bricks')];
  const plan = cells => strongholdPassage(cells, from, wanted, new Set(), new Set());
  const passage = plan([...floor, ...wall]);
  assert.equal(passage.segment, null);
  assert.deepEqual(passage.clear, [[0, 65, 1], [0, 64, 1]]);
  assert.equal(plan([...floor, ...wall, cell(0, 64, 2, 'lava')]), null);
  assert.equal(plan([...floor.slice(0, 3), ...wall]), null);
});
