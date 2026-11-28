const assert = require('node:assert/strict');
const test = require('node:test');

function cell(x, y, z, type = 'grass_block') {
  return { x, y, z, b: `minecraft:${type}` };
}

test('eating at camp closes the crafting screen and checks that the food was actually consumed', async () => {
  const { eatExpeditionMeal } = await import('./expedition-home.mjs');
  const player = { screen: 'CraftingScreen', food: 15 };
  for (const consumed of [false, true]) {
    const keys = [];
    const action = async (name, args) => {
      keys.push(name);
      if (name === 'get_inventory') return { slots: [{ id: 'minecraft:mutton', count: 6, slot: 1 }] };
      if (name === 'select_slot') return { mainHand: { id: 'minecraft:mutton' } };
      if (name === 'use_item') return { completed: true, food: consumed ? 17 : 15 };
      if (name === 'observe') return player;
      if (name === 'stop') assert.deepEqual(args, { closeScreen: true });
      if (name === 'look') assert.ok(args.pitch < 0);
      return {};
    };
    assert.equal(await eatExpeditionMeal(action, player, 'minecraft:mutton'), consumed);
    assert.deepEqual(keys.slice(0, 2), ['stop', 'look']);
  }
});

test('camp placement and foot travel accept solid End terrain but reject the void', async () => {
  const { nearbyBuildingSpots, dryWaypoint } = await import('./expedition-navigation.mjs');
  const rocks = [cell(0, 64, 0, 'end_stone'), cell(1, 64, 0, 'end_stone'), cell(2, 64, 0, 'obsidian')];
  const player = { x: 0.5, y: 65, z: 0.5 };
  assert.deepEqual(nearbyBuildingSpots(rocks, player, false), [[2, 65, 0]]);
  assert.deepEqual(dryWaypoint(rocks, [0, 65, 0], [], [3, 65, 0]), [2, 65, 0]);
});

test('a water exit follows the surface around a cliff to a dry supporting block', async () => {
  const { waterExitWaypoint } = await import('./expedition-navigation.mjs');
  const basin = [cell(0, 59, 0, 'water'), cell(0, 60, 0, 'water'), cell(0, 61, 0, 'water'), cell(0, 62, 0, 'water'),
    cell(1, 62, 0, 'stone'), cell(1, 63, 0, 'stone'),
    cell(0, 62, 1, 'water'), cell(1, 62, 1, 'kelp'), cell(2, 62, 1, 'dirt')];
  assert.deepEqual(waterExitWaypoint(basin, [0, 59, 0], 65), { surface: 62, waypoint: [0, 1] });
  assert.equal(waterExitWaypoint(basin, [0, 59, 0], 62), null);
  assert.deepEqual(waterExitWaypoint(basin.slice(0, -1), [0, 59, 0], 65), { surface: 62, waypoint: null });
});

test('a submerged wool scout rises for air before aiming and returning to dry ground', async () => {
  const { swimToDryGround } = await import('./expedition-home.mjs');
  const start = { inWorld: true, health: 10, onGround: false, air: 214, inWater: true,
    position: { x: 0.5, y: 59.8, z: 0.5 } };
  const surface = { ...start, air: 300, position: { ...start.position, y: 62.2 } };
  const land = { ...surface, inWater: false, onGround: true, position: { x: 1.5, y: 63, z: 0.5 } };
  const basin = [59, 60, 61, 62].map(y => cell(0, y, 0, 'water')).concat(cell(1, 62, 0, 'dirt'));
  const moves = [];
  const action = async (name, args) => {
    if (name === 'get_blocks') return { cells: basin };
    if (name === 'move') { moves.push(args); return {}; }
    if (name === 'observe') return moves.length === 1 ? surface : land;
    assert.fail(name);
  };
  assert.equal(await swimToDryGround(action, start), true);
  assert.deepEqual(moves, [{ jump: true, ticks: 18 }, { yaw: -90, forward: true, jump: true, ticks: 14 }]);
});

test('a wool scout stranded on a shelf swims past isolated blocks to find a walkable bank', async () => {
  const { swimToDryGround } = await import('./expedition-home.mjs');
  const at = (x, y, inWater) => ({ inWorld: true, health: 10, onGround: !inWater, air: 300, inWater,
    position: { x: x + 0.5, y, z: 0.5 } });
  const shelf = at(0, 63, false);
  const water = at(1, 62.8, true);
  const bank = at(3, 63, false);
  const cells = [cell(0, 62, 0), cell(1, 62, 0, 'water'), cell(2, 62, 0, 'water'),
    cell(1, 62, 1), cell(3, 62, 0), cell(4, 63, 0)];
  const moves = [];
  const action = async (name, args) => {
    if (name === 'get_blocks') return { cells };
    if (name === 'move') { moves.push(args); return {}; }
    if (name === 'observe') return moves.length === 1 ? water : bank;
    assert.fail(name);
  };
  assert.equal(await swimToDryGround(action, shelf, true), true);
  assert.deepEqual(moves, [
    { yaw: -90, forward: true, jump: false, ticks: 14 },
    { yaw: -90, forward: true, jump: true, ticks: 14 },
  ]);
  cells.pop();
  moves.length = 0;
  assert.equal(await swimToDryGround(action, shelf, true), false);
  assert.deepEqual(moves, []);
});

test('a quarry stair skips leaf litter above headroom and still removes the solid face', async () => {
  const { quarryStep } = await import('./expedition-navigation.mjs');
  const start = [318, 69, 289];
  const bed = [298, 69, 251];
  const forest = [
    cell(318, 70, 288, 'leaf_litter'), cell(318, 69, 288), cell(318, 68, 288, 'dirt'),
    cell(318, 67, 288, 'dirt'), cell(317, 69, 289),
  ];
  assert.deepEqual(quarryStep(forest, start, bed, [[317, 70, 289]]),
    { landing: [318, 68, 288], clear: [[318, 69, 288], [318, 68, 288]] });
});

test('a grounded granite quarry landing can continue to the next dry stair', async () => {
  const { descendQuarry } = await import('./expedition-home.mjs');
  const here = [-49, 56, -74];
  const landing = [-48, 55, -74];
  const volume = [cell(-49, 55, -74, 'granite'), cell(-48, 54, -74, 'granite')];
  const at = ([x, y, z]) => ({ inWorld: true, onGround: true, health: 20, position: { x: x + 0.5, y, z: z + 0.5 } });
  const action = async (name, args) => {
    if (name === 'get_blocks') return { cells: volume };
    if (name === 'go_to') {
      assert.deepEqual(args.pos, landing);
      return { arrived: true };
    }
    if (name === 'observe') return at(landing);
    assert.fail(name);
  };
  const stairs = [];
  assert.deepEqual(await descendQuarry(action, at(here), [0, 64, 0], stairs, new Set()), landing);
  assert.deepEqual(stairs, [here]);
  volume[0] = cell(-49, 55, -74, 'water');
  assert.equal(await descendQuarry(action, at(here), [0, 64, 0], [], new Set()), 'unavailable');
});

test('a one-way scouting ledge can be cut into a dry one-block step', async () => {
  const { uphillScoutingStep } = await import('./expedition-navigation.mjs');
  const here = [-168, 65, -32];
  const toward = [-162, 72, -31];
  const face = [cell(-168, 65, -33, 'dirt'), cell(-168, 66, -33, 'dirt'), cell(-168, 67, -33)];
  assert.deepEqual(uphillScoutingStep(face, here, toward), {
    landing: [-168, 66, -33],
    clear: [[-168, 67, -33], [-168, 66, -33]],
  });
  assert.equal(uphillScoutingStep([...face, cell(-167, 67, -33, 'water')], here, toward), null);
  assert.equal(uphillScoutingStep(face, here, toward, new Set(['-168,66,-33'])), null);
  const ceiling = cell(-168, 67, -32, 'stone');
  assert.equal(uphillScoutingStep([...face, ceiling], here, toward), null);
  assert.deepEqual(uphillScoutingStep([...face, ceiling], here, toward, new Set(), { allowCeiling: true }), {
    landing: [-168, 66, -33], clear: [[-168, 67, -32], [-168, 67, -33], [-168, 66, -33]],
  });
  assert.equal(uphillScoutingStep([...face, ceiling, cell(-168, 68, -32, 'water')], here, toward,
    new Set(), { allowCeiling: true }), null);
});

test('climbing out of a scouting ledge keeps the reached elevation', async () => {
  const { dryWaypoint } = await import('./expedition-navigation.mjs');
  const floor = [cell(0, 63, 0), cell(-1, 63, 0), cell(1, 62, 0), cell(2, 62, 0), cell(3, 62, 0)];
  const start = [0, 64, 0];
  const target = [3, 68, 0];
  assert.deepEqual(dryWaypoint(floor, start, [], target, 'elevation'), [3, 63, 0]);
  assert.deepEqual(dryWaypoint(floor, start, [], target, 'uphill'), [-1, 64, 0]);
});

test('canopy drops are measured to the top of the landing block and reject hazardous floors', async () => {
  const { canopyLanding } = await import('./expedition-navigation.mjs');
  const start = [160, 78, 161];
  const support = cell(160, 77, 161, 'birch_leaves');
  const floor = cell(160, 73, 161, 'birch_log');
  assert.deepEqual(canopyLanding([support, floor], start, 20), [160, 74, 161]);
  assert.equal(canopyLanding([support, floor], start, 12), null);
  assert.equal(canopyLanding([support, { ...floor, y: 72 }], start, 20), null);
  assert.equal(canopyLanding([support, floor, cell(160, 75, 161, 'water')], start, 20), null);
});

test('a false drop warning can only nudge onto the verified one-block quarry stair', async () => {
  const { reachQuarryLanding } = await import('./expedition-home.mjs');
  const landing = [488, 64, 284];
  const safe = [cell(488, 63, 284, 'stone')];
  for (const blocks of [safe, [], [...safe, cell(488, 64, 284, 'water')]]) {
    let moved = false;
    const action = async (name, args) => {
      if (name === 'go_to') return { arrived: false, reason: 'drop of more than 3 blocks ahead, stopped' };
      if (name === 'observe') return {
        inWorld: true, onGround: true, health: 20,
        position: moved ? { x: 488.5, y: 64, z: 284.5 } : { x: 488.13, y: 65, z: 284.5 },
      };
      if (name === 'get_blocks') return { cells: blocks };
      assert.equal(name, 'move');
      assert.equal(args.ticks, 1);
      moved = true;
      return {};
    };
    assert.equal(await reachQuarryLanding(action, landing), blocks === safe);
    assert.equal(moved, blocks === safe);
  }
});

test('an empty early-game food reserve can reroute the search toward a distant pig', async () => {
  const { gatherWool } = await import('./expedition-home.mjs');
  const player = { inWorld: true, health: 20, food: 6, position: { x: 0.5, y: 64, z: 0.5 } };
  const ground = Array.from({ length: 9 }, (_, x) => cell(x, 63, 0));
  let moved = false;
  const action = async (name, args) => {
    switch (name) {
      case 'get_inventory': return { slots: moved ? [{ id: 'minecraft:white_wool', count: 3 }] : [] };
      case 'observe': return player;
      case 'get_entities':
        if (args.type === 'sheep') return { entities: [] };
        assert.ok(args.radius >= 12, 'The pig is outside the old six-block backup search');
        return { entities: [{ id: 1, type: 'minecraft:pig', distance: 12, pos: [12, 64, 0] }] };
      case 'get_blocks': return { cells: ground };
      case 'go_to':
        assert.ok(args.pos[0] > 0);
        moved = true;
        return { arrived: true, position: args.pos };
      default: assert.fail(name);
    }
  };
  assert.equal(await gatherWool(action, () => assert.fail('The pig is reachable'), () => assert.fail('Forage by local rules')), 'white');
  assert.ok(moved);
});

test('a nearly starving player may eat the final mutton and still build the bed once the wool is ready', async () => {
  const { gatherWool } = await import('./expedition-home.mjs');
  const player = { inWorld: true, health: 15, food: 6, position: { x: 0.5, y: 64, z: 0.5 } };
  let ate = false;
  const action = async (name, args) => {
    switch (name) {
      case 'get_inventory': return { slots: [{ id: 'minecraft:white_wool', count: ate ? 3 : 2 },
        ...(!ate ? [{ id: 'minecraft:mutton', count: 1, slot: 1 }] : [])] };
      case 'observe': return player;
      case 'select_slot': return { mainHand: { id: 'minecraft:mutton' } };
      case 'use_item': ate = true; return { completed: true };
      case 'get_entities': return { entities: [] };
      case 'get_blocks': return { cells: [cell(0, 63, 0), cell(1, 63, 0)] };
      case 'go_to': return { arrived: true, position: args.pos };
      default: assert.fail(name);
    }
  };
  assert.equal(await gatherWool(action, () => assert.fail('Already on dry ground')), 'white');
  assert.ok(ate);
});

test('a flower that finishes the available color is preferred over a closer new color', async () => {
  const { findDyeFlower } = await import('./expedition-home.mjs');
  const stock = { slots: [{ id: 'minecraft:white_wool', count: 2 }, { id: 'minecraft:black_wool', count: 1 },
    { id: 'minecraft:poppy', count: 2 }] };
  const action = async name => {
    assert.equal(name, 'scan_blocks');
    return { matches: [{ name: 'minecraft:dandelion', positions: [[1, 64, 0]] },
      { name: 'minecraft:poppy', positions: [[4, 64, 0]] }] };
  };
  const target = await findDyeFlower(action, { position: { x: 0.5, y: 64, z: 0.5 } }, stock, new Set());
  assert.equal(target.name, 'minecraft:poppy');
});

test('mixed wool uses a single collected dye to complete the most common color', async () => {
  const { matchWoolWithDye } = await import('./expedition-home.mjs');
  const stock = { slots: [{ id: 'minecraft:white_wool', count: 2 }, { id: 'minecraft:black_wool', count: 1 },
    { id: 'minecraft:lily_of_the_valley', count: 1 }] };
  const craft = [];
  const action = async name => {
    assert.equal(name, 'get_inventory');
    return { slots: [{ id: 'minecraft:white_wool', count: 3 }] };
  };
  assert.equal(await matchWoolWithDye(action, async (item, amount) => craft.push([item, amount]), stock), 'white');
  assert.deepEqual(craft, [['minecraft:white_dye', 1], ['minecraft:white_wool', 1]]);
});

test('a mixed-wool scout keeps walking toward an observed flower when the next scan would omit it', async () => {
  const { gatherWool } = await import('./expedition-home.mjs');
  const flower = [9, 65, 0];
  const floor = Array.from({ length: 12 }, (_, x) => cell(x, x >= 5 ? 64 : 63, 0));
  let position = { x: 0.5, y: 64, z: 0.5 };
  let scanned = false;
  let crushed = false;
  let collected = false;
  let bedReady = false;
  const action = async (name, args) => {
    switch (name) {
      case 'get_inventory':
        return { slots: bedReady ? [{ id: 'minecraft:white_wool', count: 3 }] : [
          { id: 'minecraft:white_wool', count: 2 }, { id: 'minecraft:gray_wool', count: 1 },
          ...(collected ? [{ id: 'minecraft:lily_of_the_valley', count: 1 }] : []),
        ] };
      case 'observe':
        return { inWorld: true, onGround: true, health: 20, food: 20, position,
          crosshair: !crushed && { pos: flower, block: 'minecraft:lily_of_the_valley' } };
      case 'scan_blocks':
        if (args.blocks.some(block => block.endsWith('_bed'))) return { matches: [] };
        assert.ok(!scanned, 'The scout dropped its reachable flower target between steps');
        scanned = true;
        return { matches: [{ name: 'minecraft:lily_of_the_valley', positions: [flower] }] };
      case 'get_entities':
        return { entities: args.type === 'item' && crushed && !collected
          ? [{ id: 7, item: { id: 'minecraft:lily_of_the_valley' } }] : [] };
      case 'get_blocks':
        return { cells: floor };
      case 'go_to':
        if (args.entityId === 7) {
          collected = true;
          return { arrived: true, position: Object.values(position) };
        }
        assert.ok(args.pos[0] > position.x - 0.5, 'Stay on the route toward the flower');
        position = { x: Math.min(args.pos[0], Math.floor(position.x) + 2) + 0.5,
          y: args.pos[1], z: 0.5 };
        return { arrived: true, position: Object.values(position) };
      case 'look': return {};
      case 'break_block':
        assert.deepEqual(args.pos, flower);
        crushed = true;
        return { broken: true };
      default: assert.fail(name);
    }
  };
  const craft = async item => {
    if (item === 'minecraft:white_wool') bedReady = true;
  };
  assert.equal(await gatherWool(action, () => assert.fail('A dry path leads to the flower'), undefined, craft), 'white');
  assert.ok(collected);
});

test('a successful two-tile sheep loop retraces dry ground and defers the stationary sheep', async () => {
  const { gatherWool } = await import('./expedition-home.mjs');
  const floor = Array.from({ length: 41 }, (_, i) => cell(i - 20, 63, 0, 'grass_block'));
  const sheep = { id: 72, type: 'minecraft:sheep', distance: 55, pos: [55.5, 64, 0.5] };
  let x = -11;
  let walks = 0;
  let escaped = false;
  let freshWalk = false;
  let modelDecisions = 0;
  const scouting = [];
  const action = async (name, args) => {
    switch (name) {
      case 'get_inventory':
        return { slots: freshWalk ? [{ id: 'minecraft:white_wool', count: 3 }] : [] };
      case 'observe':
        return { inWorld: true, onGround: true, position: { x: x + 0.5, y: 64, z: 0.5 }, health: 20, food: 20 };
      case 'get_entities':
        assert.equal(args.type, 'sheep');
        return { entities: [sheep] };
      case 'get_blocks':
        return { cells: floor };
      case 'go_to': {
        if (++walks <= 8) {
          // Successful arrivals can bounce inside the same small patch.
          x = walks % 2;
        } else if (!escaped) {
          assert.ok(args.pos[0] < 0, 'Retrace the route out before making more decisions about the flock');
          x = args.pos[0];
          escaped = x <= -9;
        } else {
          x = args.pos[0];
          freshWalk = true;
        }
        return { arrived: true, position: [x + 0.5, 64, 0.5] };
      }
      default: assert.fail(name);
    }
  };
  const color = await gatherWool(action, () => assert.fail('Known dry way out'), (_, routes) => {
    assert.ok(!escaped, 'The same stationary sheep must not immediately restart the loop');
    modelDecisions++;
    return routes[0];
  }, undefined, message => scouting.push(message));
  assert.equal(color, 'white');
  assert.equal(modelDecisions, 8);
  assert.ok(scouting.some(message => message.startsWith('The route keeps returning')));
});

test('an unarmored scout runs away from a close skeleton along native dry waypoints', async () => {
  const { retreatFromNearbyMob } = await import('./expedition-home.mjs');
  const player = { position: { x: 0.5, y: 64, z: 0.5 }, timeOfDay: 15_000, health: 20,
    threats: [{ id: 71, type: 'minecraft:skeleton', distance: 4 }] };
  const ground = Array.from({ length: 17 }, (_, i) => cell(i - 8, 63, 0));
  let stepped = false;
  const action = async (name, args) => {
    switch (name) {
      case 'get_entities': return { entities: [{ id: 71, hostile: true, pos: [4.5, 64, 0.5] }] };
      case 'get_blocks': return { cells: ground };
      case 'go_to': stepped = args.pos[0] < 0; return { arrived: true, position: args.pos };
      default: assert.fail(name);
    }
  };
  assert.equal(await retreatFromNearbyMob(action, player, [], new Set()), true);
  assert.ok(stepped);
});

test('a skeleton in shooting range interrupts an exposed daylight wait before it reaches seven blocks', async () => {
  const { waitForDaylightRecovery } = await import('./expedition-home.mjs');
  const skeleton = { id: 3029, type: 'minecraft:skeleton', hostile: true, distance: 10.3, pos: [10.8, 94, 0.5] };
  const floor = Array.from({ length: 17 }, (_, i) => cell(i - 8, 93, 0));
  let escaped = false;
  const action = async (name, args) => {
    if (name === 'observe') return { inWorld: true, onGround: true, dimension: 'minecraft:overworld',
      position: { x: 0.5, y: 94, z: 0.5 }, health: 20, timeOfDay: escaped ? 20 : 22_800,
      gameTime: 35_500, threats: escaped ? [] : [skeleton] };
    if (name === 'get_entities') return { entities: args.radius >= 11 ? [skeleton] : [] };
    if (name === 'get_blocks') return { cells: floor };
    if (name === 'get_inventory') return { slots: [] };
    if (name === 'go_to') {
      assert.ok(args.pos[0] < 0);
      escaped = true;
      return { arrived: true, position: args.pos };
    }
    assert.fail(name);
  };
  await waitForDaylightRecovery(action, [50, 94, 0], () => {});
  assert.ok(escaped);
});

test('a wounded owner faces the archer with an offhand shield before taking a step toward Mushroom', async () => {
  const { regroupExpeditionCompanion } = await import('./expedition-home.mjs');
  const archer = { id: 69, type: 'minecraft:skeleton', distance: 14 };
  const dog = { uuid: 'original', pos: [5.5, 64, 0.5], distance: 10, health: 2 };
  let shielded = false;
  let looked = false;
  let reunited = false;
  const action = async (name, args) => {
    switch (name) {
      case 'observe': return { inWorld: true, health: 5, onGround: true,
        position: { x: reunited ? 2.5 : -4.5, y: 64, z: 0.5 }, threats: shielded ? [] : [archer] };
      case 'get_entities': return { entities: [reunited ? { ...dog, distance: 3 } : dog] };
      case 'get_inventory': return { selectedSlot: 0, slots: [{ slot: 0, id: 'minecraft:stone_pickaxe' },
        { slot: 40, id: 'minecraft:shield', maxDamage: 336, damage: 1 }] };
      case 'look': assert.equal(args.entityId, archer.id); looked = true; return {};
      case 'use_item':
        assert.ok(looked && args.ticks >= 36);
        shielded = true;
        return { completed: true, health: 5 };
      case 'get_blocks': return { cells: Array.from({ length: 13 }, (_, x) => cell(x - 5, 63, 0)) };
      case 'go_to':
        assert.ok(shielded, 'Started across open ground before shielding');
        reunited = true;
        return { arrived: true, position: [2.5, 64, 0.5] };
      default: assert.fail(name);
    }
  };
  assert.equal((await regroupExpeditionCompanion(action, dog.uuid, dog.pos)).uuid, dog.uuid);
  assert.ok(reunited);
});

test('an emergency dugout requires solid ground and leaves a three-step exit after its cap is removed', async () => {
  const { planEmergencyDugout } = await import('./expedition-navigation.mjs');
  const terrain = [];
  for (let x = -3; x <= 3; x++) {
    for (let z = -3; z <= 3; z++) {
      for (let y = 60; y < 64; y++) terrain.push(cell(x, y, z, 'stone'));
    }
  }
  const plan = planEmergencyDugout(terrain, [0, 64, 0]);
  assert.deepEqual(plan.dig, [[0, 63, 0], [0, 62, 0], [0, 61, 0]]);
  assert.deepEqual(plan.floor, [0, 61, 0]);
  assert.deepEqual(plan.cap, [0, 63, 0]);
  assert.deepEqual(plan.exit.map(step => step.landing), [[1, 62, 0], [2, 63, 0], [3, 64, 0]]);
  assert.ok(plan.exit.every(step => step.clear.every(block => String(block) !== String(plan.cap))));
  const flooded = terrain.map(block => block.x === 0 && block.z === 0 && block.y === 60
    ? cell(0, 60, 0, 'lava') : block);
  assert.equal(planEmergencyDugout(flooded, [0, 64, 0]), null);
});

test('an off-center player uses a short movement input before digging and waits under the cap', async () => {
  const { shelterUnderRangedFire } = await import('./expedition-home.mjs');
  const terrain = new Map();
  for (let x = -3; x <= 3; x++) {
    for (let z = -3; z <= 3; z++) {
      for (let y = 60; y < 64; y++) terrain.set(String([x, y, z]), cell(x, y, z, 'stone'));
    }
  }
  let position = { x: 0.82, y: 64, z: 0.25 };
  const player = { inWorld: true, health: 1, onGround: true, position };
  let aim;
  let centered = false;
  let covered = false;
  let selectedSlot = 0;
  const slots = [{ slot: 0, id: 'minecraft:stone_pickaxe', count: 1, maxDamage: 131 },
    { slot: 1, id: 'minecraft:cobblestone', count: 3 }];
  const ascents = [];
  const action = async (name, args) => {
    switch (name) {
      case 'get_blocks': return { cells: [...terrain.values()] };
      case 'get_inventory': return { slots, mainHand: slots[selectedSlot] };
      case 'select_slot': selectedSlot = args.slot; return { mainHand: slots[selectedSlot] };
      case 'move':
        assert.deepEqual({ ticks: args.ticks, forward: args.forward }, { ticks: 2, forward: true });
        position = { x: 0.5, y: 64, z: 0.5 };
        centered = true;
        return {};
      case 'look': aim = args.at; return {};
      case 'observe': return { ...player, position, timeOfDay: covered ? 1_000 : 18_000,
        crosshair: aim && { pos: aim, block: terrain.get(String(aim))?.b } };
      case 'break_block':
        assert.ok(centered && terrain.delete(String(args.pos)));
        if (args.pos[0] === 0 && args.pos[2] === 0 && args.pos[1] === position.y - 1) {
          position = { ...position, y: args.pos[1] };
        }
        return { broken: true };
      case 'place_block':
        assert.equal(position.y, 61);
        assert.deepEqual(args.pos, [0, 63, 0]);
        assert.equal(slots[selectedSlot].id, 'minecraft:cobblestone');
        terrain.set(String(args.pos), cell(...args.pos, 'cobblestone'));
        covered = true;
        return { blockAtPos: 'minecraft:cobblestone' };
      case 'go_to':
        assert.ok(covered && args.stopDistance >= 0.3);
        assert.equal(terrain.has('0,63,0'), false);
        ascents.push(args.pos[1]);
        position = { x: args.pos[0] + 0.5, y: args.pos[1], z: args.pos[2] + 0.5 };
        return { arrived: true };
      default: assert.fail(name);
    }
  };
  assert.equal(await shelterUnderRangedFire(action, player), true);
  assert.deepEqual(ascents, [62, 63, 64]);
});

test('a creeper at fourteen blocks diverts the next scouting walk before the fuse', async () => {
  const { retreatFromNearbyMob } = await import('./expedition-home.mjs');
  const player = { position: { x: 0.5, y: 64, z: 0.5 }, timeOfDay: 5_850, health: 16,
    threats: [{ id: 8721, type: 'minecraft:creeper', distance: 14.5 }] };
  const ground = Array.from({ length: 17 }, (_, i) => cell(i - 8, 63, 0));
  const action = async (name, args) => {
    if (name === 'get_entities') {
      assert.ok(args.radius >= 15);
      return { entities: [{ id: 8721, hostile: true, pos: [15, 64, 0.5] }] };
    }
    if (name === 'get_blocks') return { cells: ground };
    if (name === 'go_to') {
      assert.ok(args.pos[0] < 0);
      return { arrived: true, position: args.pos };
    }
    assert.fail(name);
  };
  assert.equal(await retreatFromNearbyMob(action, player, [], new Set()), true);
});

test('several solid rock layers keep a cave creeper from trapping a surface scout in retreat', async () => {
  const { retreatFromNearbyMob } = await import('./expedition-home.mjs');
  const player = { position: { x: 0.5, y: 65, z: 0.5 }, onGround: true, health: 20,
    threats: [{ id: 9, type: 'minecraft:creeper', distance: 10.6 }] };
  const creeper = { id: 9, hostile: true, pos: [6.5, 56, 0.5] };
  const rock = [cell(1, 65, 0, 'stone'), cell(1, 64, 0, 'stone'), cell(2, 63, 0, 'stone')];
  const ground = Array.from({ length: 9 }, (_, index) => cell(-index, 64, 0, 'grass_block'));
  let terrain = rock;
  let retreat = false;
  const action = async (name, args) => {
    if (name === 'get_entities') return { entities: [creeper] };
    if (name === 'get_blocks') return { cells: args.size[0] === 17 ? ground : terrain };
    if (name === 'go_to') {
      assert.ok(args.pos[0] < 0);
      retreat = true;
      return { arrived: true, position: args.pos };
    }
    assert.fail(name);
  };
  assert.equal(await retreatFromNearbyMob(action, player, [], new Set()), false);
  terrain = [];
  assert.equal(await retreatFromNearbyMob(action, player, [], new Set()), true);
  assert.ok(retreat);
});

test('retreat navigation rejects a route whose first step would approach the threat', async () => {
  const { dryWaypoint } = await import('./expedition-navigation.mjs');
  const floor = [cell(0, 63, 0), cell(1, 63, 0), cell(2, 63, 0)];
  const here = [0, 64, 0];
  const threat = [3, 64, 0];
  assert.equal(dryWaypoint(floor, here, [], [-4, 64, 0], undefined, new Set(), threat), null);
  floor.push(cell(0, 63, -1), cell(0, 63, -2));
  assert.deepEqual(dryWaypoint(floor, here, [], [-4, 64, 0], undefined, new Set(), threat), [0, 64, -1]);
});

test('after adoption the player can sleep in a nearby vanilla bed at night', async () => {
  const { sleepNearby } = await import('./expedition-home.mjs');
  const player = { inWorld: true, dimension: 'minecraft:overworld', timeOfDay: 15_000,
    position: { x: 0.5, y: 1, z: 0.5 } };
  const interactions = [];
  let wakeObservations = 0;
  const action = async (name, args) => {
    switch (name) {
      case 'get_blocks': return { cells: [
        { x: 1, y: 1, z: 0, b: 'mushroom_yorkie:dog_bed' }, cell(2, 1, 0, 'white_bed'),
      ] };
      case 'observe':
        if (!interactions.length) return player;
        return { ...player, timeOfDay: ++wakeObservations === 1 ? 21_549 : 12 };
      case 'interact_block':
        interactions.push(args.pos);
        return { screenOpened: 'InBedChatScreen' };
      default: throw new Error(`Unexpected action: ${name}`);
    }
  };
  assert.equal(await sleepNearby(action, player), true);
  assert.equal(wakeObservations, 2);
  assert.deepEqual(interactions, [[2, 1, 0]]);
  assert.equal(await sleepNearby(async () => assert.fail('Daylight started a sleep action'),
    { ...player, timeOfDay: 2_000 }), false);
});

test('night cover requires headroom, a solid roof, and a way out', async () => {
  const { nearestCover } = await import('./expedition-navigation.mjs');
  const alcove = [
    cell(3, 0, 0, 'stone'), cell(3, 3, 0, 'stone'),
    cell(4, 1, 0, 'stone'), cell(4, 2, 0, 'stone'),
    cell(3, 1, 1, 'dirt'), cell(3, 2, 1, 'dirt'),
  ];
  const nearLeaves = [cell(1, 0, 0), cell(1, 3, 0, 'oak_leaves')];
  assert.deepEqual(nearestCover([...alcove, ...nearLeaves], [0, 1, 0]), [3, 1, 0]);
  assert.equal(nearestCover([...alcove, cell(3, 1, 0, 'lava')], [0, 1, 0]), null);
  assert.equal(nearestCover([...alcove, cell(2, 1, 0), cell(2, 2, 0), cell(3, 1, -1), cell(3, 2, -1)],
    [0, 1, 0]), null);
});

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

test('the quarry changes tools at the soil-to-stone boundary and keeps the pickaxe off dirt', async () => {
  const { breakVisible } = await import('./expedition-home.mjs');
  const pick = { id: 'minecraft:stone_pickaxe', slot: 0, count: 1, damage: 0, maxDamage: 131 };
  const shovel = { id: 'minecraft:wooden_shovel', slot: 1, count: 1, damage: 0, maxDamage: 59 };
  const pos = [1, 1, 0];
  let slots = [pick, shovel];
  let selectedSlot = 0;
  let block = 'minecraft:dirt';
  const breaking = [];
  const action = async (name, args) => {
    const mainHand = () => slots.find(stack => stack.slot === selectedSlot);
    if (name === 'look') return {};
    if (name === 'observe') return { crosshair: { pos, block } };
    if (name === 'get_inventory') return { selectedSlot, mainHand: mainHand(), slots };
    if (name === 'select_slot') {
      selectedSlot = args.slot;
      return { mainHand: mainHand() };
    }
    assert.equal(name, 'break_block');
    breaking.push(mainHand()?.id);
    return { broken: true };
  };
  assert.ok((await breakVisible(action, pos))?.broken);
  block = 'minecraft:iron_ore';
  assert.ok((await breakVisible(action, pos))?.broken);
  block = 'minecraft:grass_block';
  slots = [pick];
  assert.ok((await breakVisible(action, pos))?.broken);
  block = 'minecraft:iron_ore';
  slots = [{ ...pick, id: 'minecraft:wooden_pickaxe' }];
  assert.equal(await breakVisible(action, pos), null);
  assert.deepEqual(breaking, [shovel.id, pick.id, undefined]);
});

test('a route to an elevated camp climbs instead of stopping directly below it', async () => {
  const { dryWaypoint } = await import('./expedition-navigation.mjs');
  const terrain = [
    cell(0, 0, 0), cell(1, 0, 0), cell(2, 0, 0),
    cell(0, 1, 1), cell(1, 2, 1), cell(2, 3, 1), cell(2, 3, 0),
  ];
  assert.deepEqual(dryWaypoint(terrain, [0, 1, 0], [], [2, 4, 0]), [0, 2, 1]);
});

test('Nether powder crafting spends only as many rods as needed when resuming', async () => {
  const { craftBlazePowder } = await import('./expedition-blaze-rods.mjs');
  const powderItem = 'minecraft:blaze_powder';
  let powder = 10;
  let rods = 2;
  const action = async name => {
    assert.equal(name, 'get_inventory');
    return { slots: [{ id: powderItem, count: powder }, { id: 'minecraft:blaze_rod', count: rods }] };
  };
  const craft = async (item, amount) => {
    assert.equal(item, powderItem);
    assert.equal(amount, 2);
    powder += amount;
    rods--;
  };
  await craftBlazePowder(action, craft, 12);
  await craftBlazePowder(action, craft, 12);
  assert.equal(powder, 12);
  assert.equal(rods, 1);
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

test('the respawn route can verify the original live companion when the guide is gone', async () => {
  const { recoverDroppedLoadout } = await import('./expedition-home.mjs');
  const companionUuid = '032ed6d2-13a5-466b-8750-1f1b02ce3e36';
  const action = async (name, args) => {
    switch (name) {
      case 'observe': return { inWorld: true, health: 15, position: { x: 10, y: 64, z: 10 } };
      case 'get_inventory': return { slots: [
        { id: 'minecraft:stone_pickaxe', count: 1 },
        { id: 'minecraft:furnace', count: 1 },
      ] };
      case 'get_entities': return { entities: args.type === 'mushroom_yorkie:mushroom_yorkie'
        ? [{ uuid: companionUuid, health: 5 }] : [] };
      default: throw new Error(`Unexpected action: ${name}`);
    }
  };
  assert.equal(await recoverDroppedLoadout(action, [10, 64, 10], { companionUuid }), 'companion');
});

test('visible gear selects direct recovery in safe daylight, then equips the shield', async () => {
  const { daylightLoadoutIsVisible, recoverDroppedLoadout } = await import('./expedition-home.mjs');
  const guide = 'mushroom_yorkie:field_guide';
  const shield = 'minecraft:shield';
  const player = { inWorld: true, onGround: true, health: 18.3, food: 17, timeOfDay: 2_200,
    position: { x: -20.5, y: 63, z: 51.5 } };
  const destination = [-21, 63, 51];
  const picked = [];
  let equipped = false;
  const action = async (name, args) => {
    switch (name) {
      case 'observe': return player;
      case 'get_entities': return { entities: [
        { id: 10, item: { id: shield }, pos: [-18.7, 64, 51.7] },
        { id: 11, item: { id: guide }, pos: [-21.3, 63, 51.5] },
      ] };
      case 'go_to': picked.push(args.entityId); return { arrived: true };
      case 'get_container': return { slots: [{ id: shield, section: 'player', slot: 38 }] };
      case 'click_slot':
        assert.deepEqual(args, { slot: 38, action: 'swap', hotbar: 40 });
        equipped = true;
        return {};
      case 'get_inventory': return { slots: [
        ...picked.includes(10) ? [{ id: shield, slot: equipped ? 40 : 2, count: 1 }] : [],
        ...picked.includes(11) ? [{ id: guide, slot: 3, count: 1 }] : [],
      ] };
      default: assert.fail(name);
    }
  };
  assert.equal(await daylightLoadoutIsVisible(action, { ...player, timeOfDay: 14_000 }, destination), false);
  assert.equal(await daylightLoadoutIsVisible(action, player, [0, 63, 0]), false);
  assert.equal(await daylightLoadoutIsVisible(action, player, destination), true);
  assert.equal(await recoverDroppedLoadout(action, destination, { direct: true }), 'guide');
  assert.deepEqual(picked, [11, 10]);
  assert.equal(equipped, true);
});

test('recovery widens its distance from pursuing zombies before returning to gear', async () => {
  const { recoverDroppedLoadout } = await import('./expedition-home.mjs');
  const zombie = { id: 36, type: 'minecraft:zombie', pos: [8.2, 64, 0.5], distance: 7.7, hostile: true };
  const guide = 'mushroom_yorkie:field_guide';
  const floor = Array.from({ length: 9 }, (_, x) => cell(-x, 63, 0));
  let retreated = false;
  let collected = false;
  const action = async (name, args) => {
    switch (name) {
      case 'observe':
        return { inWorld: true, health: 20, threats: retreated ? [] : [zombie],
          position: { x: retreated ? -5.5 : 0.5, y: 64, z: 0.5 } };
      case 'get_entities':
        return { entities: args.type === 'item'
          ? [{ id: 80, item: { id: guide }, pos: [-5, 64, 0] }] : [zombie] };
      case 'get_blocks':
        return { cells: floor };
      case 'go_to':
        if (args.pos) {
          assert.ok(args.pos[0] < 0);
          retreated = true;
          return { arrived: true, position: args.pos };
        }
        assert.ok(retreated);
        assert.equal(args.entityId, 80);
        collected = true;
        return { arrived: true };
      case 'get_inventory':
        return { slots: collected ? [{ id: guide, count: 1 }] : [] };
      default:
        assert.fail(`Unexpected action: ${name}`);
    }
  };
  assert.equal(await recoverDroppedLoadout(action, [-5, 64, 0]), 'guide');
});

test('a gear recovery with low health stops before approaching the old death location', async () => {
  const { recoverDroppedLoadout } = await import('./expedition-home.mjs');
  await assert.rejects(recoverDroppedLoadout(async name => {
    assert.equal(name, 'observe');
    return { inWorld: true, health: 5, position: { x: 11.5, y: 64, z: 10.5 } };
  }, [10, 64, 10]), /return to the dropped gear became unsafe/);
});

test('a hunt routes around an obstruction before giving up a wounded cow', async () => {
  const { hunt } = await import('./expedition-home.mjs');
  const cow = { id: 10, type: 'minecraft:cow', pos: [3, 64, 0] };
  const floor = Array.from({ length: 5 }, (_, x) => ({ x, y: 63, z: 0, b: 'minecraft:grass_block' }));
  floor.push({ x: 1, y: 64, z: 0, b: 'minecraft:oak_log' });
  for (let x = 0; x < 5; x++) floor.push({ x, y: 63, z: 1, b: 'minecraft:grass_block' });
  let detoured = false;
  let struck = false;
  let pickedUp = false;
  const action = async (name, args) => {
    switch (name) {
      case 'get_inventory': return { slots: [] };
      case 'get_entities': return { entities: args.type === 'item'
        ? [{ id: 11, item: { id: 'minecraft:beef' } }] : struck ? [] : [cow] };
      case 'go_to':
        if (args.entityId === 11) pickedUp = true;
        if (args.pos) {
          assert.equal(args.pos[2], 1);
          detoured = true;
        }
        return { arrived: detoured, position: args.pos };
      case 'look': return {};
      case 'observe': return { inWorld: true, health: 15, position: { x: 0.5, y: 64, z: 0.5 },
        crosshair: detoured ? { id: cow.id } : { type: 'block' } };
      case 'get_blocks': return { cells: floor };
      case 'attack_entity':
        assert.ok(detoured);
        struck = true;
        return {};
      default: throw new Error(`Unexpected action: ${name}`);
    }
  };
  assert.ok(await hunt(action, cow, item => item === 'minecraft:beef'));
  assert.ok(detoured && struck && pickedUp);
});

test('a hunt rechecks safety after approaching and can cancel the swing', async () => {
  const { hunt } = await import('./expedition-home.mjs');
  const blaze = { id: 11, type: 'minecraft:blaze' };
  let checks = 0;
  const action = async (name, args) => {
    switch (name) {
      case 'get_inventory': return { slots: [] };
      case 'get_entities': return { entities: [blaze] };
      case 'go_to':
      case 'look':
        assert.equal(args.entityId, blaze.id);
        return { arrived: true };
      case 'observe': return { crosshair: { id: blaze.id } };
      default: assert.fail(`Unexpected action: ${name}`);
    }
  };
  assert.equal(await hunt(action, blaze, item => item === 'minecraft:blaze_rod', async () => ++checks === 1), false);
  assert.equal(checks, 2);
});

test('a hunt uses the native crosshair after an approach times out within reach', async () => {
  const { hunt } = await import('./expedition-home.mjs');
  const sheep = { id: 21, type: 'minecraft:sheep', pos: [2.3, 64, 0.5] };
  let struck = false;
  const action = async (name, args) => {
    switch (name) {
      case 'get_inventory': return { slots: [] };
      case 'get_entities': return { entities: struck ? [] : [sheep] };
      case 'go_to': return { arrived: false, reason: 'timed out 1.77 blocks away' };
      case 'look': return {};
      case 'observe': return { inWorld: true, health: 20, position: { x: 0.5, y: 64, z: 0.5 },
        crosshair: { id: sheep.id } };
      case 'attack_entity':
        assert.equal(args.entityId, sheep.id);
        struck = true;
        return {};
      default: assert.fail(name);
    }
  };
  assert.ok(await hunt(action, sheep, item => item === 'minecraft:mutton'));
  assert.ok(struck);
});

test('an uphill approach takes the stairs toward an animal above a shelf', async () => {
  const { dryWaypoint } = await import('./expedition-navigation.mjs');
  const cells = [];
  for (let x = 0; x <= 6; x++) cells.push({ x, y: 63, z: 0, b: 'minecraft:stone' });
  for (let z = 1; z <= 3; z++) cells.push({ x: 0, y: 63 + z, z, b: 'minecraft:grass_block' });
  assert.deepEqual(dryWaypoint(cells, [0, 64, 0], [], [7, 67, 0], 'elevation'), [0, 67, 3]);
});

test('iron scouting favors a dry cave with exposed walls', async () => {
  const { dryWaypoint } = await import('./expedition-navigation.mjs');
  const cells = [];
  for (let x = 0; x <= 7; x++) cells.push({ x, y: 63, z: 0, b: 'minecraft:grass_block' });
  for (let z = 1; z <= 4; z++) {
    cells.push({ x: 0, y: 63, z, b: 'minecraft:stone' });
    cells.push({ x: 1, y: 64, z, b: 'minecraft:stone' });
    cells.push({ x: 0, y: 66, z, b: 'minecraft:stone' });
  }
  assert.deepEqual(dryWaypoint(cells, [0, 64, 0], [[0, 64, 0]], undefined, 'cave'), [0, 64, 4]);
});

test('iron scouting walks toward a visible vein and disregards a sealed one', async () => {
  const { dryWaypoint } = await import('./expedition-navigation.mjs');
  const start = [0, 64, 0];
  const floor = [];
  for (let x = -8; x <= 8; x++) {
    for (let z = -8; z <= 8; z++) floor.push({ x, y: 63, z, b: 'minecraft:grass_block' });
  }
  const vein = { x: 0, y: 65, z: 6, b: 'minecraft:iron_ore' };
  const approach = cells => {
    const first = dryWaypoint(cells, start, [start], undefined, 'iron');
    return dryWaypoint(cells, first, [start, first], undefined, 'iron');
  };
  const range = ([x, , z]) => Math.hypot(x - vein.x, z - vein.z);
  assert.ok(range(approach([...floor, vein])) <= 4);
  assert.ok(range(approach(floor)) > 4);

  const shell = [];
  for (let x = -1; x <= 1; x++) {
    for (let y = 64; y <= 66; y++) {
      for (let z = 5; z <= 7; z++) {
        if (x !== 0 || y !== 65 || z !== 6) shell.push({ x, y, z, b: 'minecraft:stone' });
      }
    }
  }
  assert.deepEqual(
    dryWaypoint([...floor, ...shell, vein], start, [], undefined, 'iron'),
    dryWaypoint([...floor, ...shell, { ...vein, b: 'minecraft:stone' }], start, [], undefined, 'iron'),
  );
});

test('a recorded quarry exit with no footing can be restored from a dry adjacent ledge', async () => {
  const { missingQuarryExitSupport } = await import('./expedition-navigation.mjs');
  const target = [256, 85, -64];
  const floor = [
    { x: 256, y: 82, z: -64, b: 'minecraft:grass_block' },
    { x: 256, y: 83, z: -65, b: 'minecraft:grass_block' },
  ];
  assert.deepEqual(missingQuarryExitSupport(floor, target), {
    stances: [[256, 84, -65]],
    blocksToPlace: [[256, 83, -64], [256, 84, -64]],
  });
  assert.equal(missingQuarryExitSupport([
    ...floor, { x: 256, y: 83, z: -64, b: 'minecraft:water' },
  ], target), null);
  assert.equal(missingQuarryExitSupport(floor.slice(1), target), null);
});

test('a verified flat quarry exit can finish a short move after a false drop warning', async () => {
  const { climbQuarry } = await import('./expedition-home.mjs');
  const target = [915, 68, 206];
  const player = { inWorld: true, onGround: true, health: 20, position: { x: 915.52, y: 68, z: 206.87 } };
  let nudged = false;
  const action = async (name, args) => {
    switch (name) {
      case 'go_to': return { arrived: false, reason: 'drop of more than 3 blocks ahead, stopped' };
      case 'observe': return nudged ? { ...player, position: { ...player.position, z: 206.74 } } : player;
      case 'get_blocks':
        assert.deepEqual(args.center, target);
        return { cells: [{ x: 915, y: 67, z: 206, b: 'minecraft:stone' }] };
      case 'move':
        assert.equal(args.ticks, 1);
        nudged = true;
        return {};
      default: assert.fail(name);
    }
  };
  assert.ok(await climbQuarry(action, target));
  assert.ok(nudged);
});

test('stronghold scouting walks from half-block footing onto the next slab', async () => {
  const { stepOut } = await import('./expedition-home.mjs');
  const floor = [
    { x: 0, y: -6, z: 0, b: 'minecraft:smooth_stone_slab' },
    { x: 1, y: -5, z: 0, b: 'minecraft:stone_brick_slab' },
    { x: 2, y: -5, z: 0, b: 'minecraft:mossy_stone_bricks' },
    { x: 1, y: -4, z: 0, b: 'minecraft:cave_air' },
    { x: 2, y: -4, z: 0, b: 'minecraft:cave_air' },
    { x: 2, y: -3, z: 0, b: 'minecraft:stone_button' },
  ];
  const player = { position: { x: 0.5, y: -5.5, z: 0.5 }, onGround: true };
  const action = async (name, args) => {
    if (name === 'get_blocks') {
      assert.deepEqual(args.center, [0, -5, 0]);
      return { cells: floor };
    }
    assert.equal(name, 'go_to');
    assert.deepEqual(args.pos, [2, -4, 0]);
    return { arrived: true, position: [2.5, -4, 0.5] };
  };
  assert.ok(await stepOut(action, player, [], [2, -4, 0], 'stronghold'));
});

test('an escape between two clouds avoids both centers', async () => {
  const { dryWaypoint } = await import('./expedition-navigation.mjs');
  const cells = [];
  for (let x = -6; x <= 6; x++) {
    for (let z = -6; z <= 6; z++) cells.push({ x, y: 63, z, b: 'minecraft:end_stone' });
  }
  const escaped = dryWaypoint(cells, [0, 64, 0], [], [-8, 64, 0], 'surface', new Set(),
    [[2, 64, 0], [-3, 64, 0]]);
  assert.equal(escaped[0], 0);
  assert.notEqual(escaped[2], 0);
});

test('timber collection clears leaves blocking the walk and the mining crosshair', async () => {
  const { ensurePlanks } = await import('./expedition-home.mjs');
  const entrance = [1, 65, 0];
  const branch = [2, 65, 0];
  const log = [3, 65, 0];
  const broken = [];
  let stock = [];
  const action = async (name, args) => {
    switch (name) {
      case 'get_inventory': return { slots: stock };
      case 'scan_blocks': return { matches: [{ name: 'minecraft:oak_log', positions: [log] }] };
      case 'go_to':
        if (args.entityId) stock = [{ id: 'minecraft:oak_log', count: 1 }];
        return broken.length ? { arrived: true }
          : { arrived: false, reason: 'blocked by minecraft:oak_leaves at 1,65,0 (head)' };
      case 'look': return {};
      case 'observe': return { position: { x: 0.5, y: 64, z: 0.5 },
        crosshair: broken.length === 1 ? { pos: branch, block: 'minecraft:oak_leaves' } : { pos: log } };
      case 'break_block':
        broken.push(args.pos);
        return { broken: true };
      case 'get_entities': return { entities: [{ id: 11, item: { id: 'minecraft:oak_log' } }] };
      default: throw new Error(`Unexpected action: ${name}`);
    }
  };
  await ensurePlanks(action, async (item, quantity) => { stock = [{ id: item, count: quantity }]; }, 3);
  assert.deepEqual(broken, [entrance, branch, log]);
  assert.deepEqual(stock, [{ id: 'minecraft:oak_planks', count: 4 }]);
});

test('starter planks can use a reachable fourth log above the first three', async () => {
  const { ensurePlanks } = await import('./expedition-home.mjs');
  const player = { inWorld: true, onGround: true, health: 20, position: { x: -13.7, y: 63, z: -5.9 } };
  const log = [-14, 66, -6];
  const blocks = [{ name: 'minecraft:oak_log', positions: [log, [-14, 67, -6]] }];
  let stock = [{ id: 'minecraft:oak_planks', count: 12 }];
  const broken = [];
  const action = async (name, args) => {
    switch (name) {
      case 'get_inventory': return { slots: stock };
      case 'scan_blocks': return { matches: blocks };
      case 'look': assert.deepEqual(args.at, log); return {};
      case 'observe': return { ...player, crosshair: { pos: log, block: 'minecraft:oak_log' } };
      case 'go_to':
        if (args.entityId) stock.push({ id: 'minecraft:oak_log', count: 1 });
        return { arrived: true };
      case 'break_block': broken.push(args.pos); return { broken: true };
      case 'get_entities': return { entities: [{ id: 11, item: { id: 'minecraft:oak_log' } }] };
      default: assert.fail(`Unexpected action: ${name}`);
    }
  };
  await ensurePlanks(action, async (item, quantity) => { stock = [{ id: item, count: 12 + quantity }]; }, 14);
  assert.deepEqual(broken, [log]);
  assert.equal(stock[0].count, 16);
});

test('timber scouting leaves a failed canopy log for a reachable trunk found farther away', async () => {
  const { ensurePlanks } = await import('./expedition-home.mjs');
  const canopy = [0, 69, 0];
  const trunk = [15, 64, 0];
  let x = 0.5;
  let lookedAt;
  let stock = [{ id: 'minecraft:oak_planks', count: 2 }];
  const approached = [];
  const broken = [];
  const action = async (name, args) => {
    switch (name) {
      case 'get_inventory': return { slots: stock };
      case 'observe': return { inWorld: true, onGround: true, health: 20, position: { x, y: 64, z: 0.5 },
        crosshair: lookedAt === trunk ? { pos: trunk, block: 'minecraft:oak_log' } : undefined };
      case 'scan_blocks': {
        const positions = args.radius > 12 || x >= 5 ? [canopy, trunk] : [canopy];
        return { matches: [{ name: 'minecraft:oak_log', positions }] };
      }
      case 'get_blocks': return { cells: Array.from({ length: 17 }, (_, i) => cell(i, 63, 0, 'grass_block')) };
      case 'go_to':
        if (args.entityId === 11) {
          stock.push({ id: 'minecraft:oak_log', count: 1 });
        } else if (args.maxTicks === 65) {
          approached.push(args.pos);
          if (args.pos === canopy) return { arrived: false, reason: 'timed out above the ground' };
        } else {
          assert.ok(args.pos[0] > x, 'walk toward the other trunk');
          x = args.pos[0] + 0.5;
        }
        return { arrived: true };
      case 'look': lookedAt = args.at; return {};
      case 'break_block': broken.push(args.pos); return { broken: true };
      case 'get_entities': return { entities: [{ id: 11, item: { id: 'minecraft:oak_log' } }] };
      default: assert.fail(name);
    }
  };
  await ensurePlanks(action, async (item, count) => { stock = [{ id: item, count: 2 + count }]; }, 3);
  assert.deepEqual(approached, [canopy, trunk]);
  assert.deepEqual(broken, [trunk]);
  assert.equal(stock[0].count, 6);
});

test('a log cut from above is collected after it falls into reach', async () => {
  const { ensurePlanks } = await import('./expedition-home.mjs');
  const log = [1, 69, 0];
  const player = { inWorld: true, onGround: true, health: 20, position: { x: 0.5, y: 64, z: 0.5 } };
  const axe = { id: 'minecraft:stone_axe', slot: 1, maxDamage: 131 };
  const stock = [axe];
  let selected = false;
  let scans = 0;
  const action = async (name, args) => {
    switch (name) {
      case 'get_inventory': return { slots: stock, mainHand: selected ? axe : undefined };
      case 'scan_blocks': return { matches: [{ name: 'minecraft:oak_log', positions: [log] }] };
      case 'look': return {};
      case 'observe': return { ...player, crosshair: { pos: log, block: 'minecraft:oak_log' } };
      case 'select_slot': selected = args.slot === axe.slot; return { mainHand: axe };
      case 'break_block': return { broken: true };
      case 'get_entities':
        return { entities: ++scans < 2 ? [] : [{ id: 11, item: { id: 'minecraft:oak_log' } }] };
      case 'go_to':
        if (args.entityId === 11) stock.push({ id: 'minecraft:oak_log', count: 1 });
        return { arrived: true };
      default: assert.fail(`Unexpected action: ${name}`);
    }
  };
  await ensurePlanks(action, async (item, count) => stock.push({ id: item, count }), 3);
  assert.equal(stock.at(-1).id, 'minecraft:oak_planks');
  assert.ok(selected, 'use the owned axe for chopping timber');
});

test('the player clears tall grass from the crosshair before packing the camp furnace', async () => {
  const { recoverPlacedFurnace } = await import('./expedition-home.mjs');
  const furnace = [-226, 69, -120];
  const grass = [-225, 70, -119];
  const pickaxe = { id: 'minecraft:stone_pickaxe', slot: 0, maxDamage: 131 };
  const broken = [];
  let pickedUp = false;
  const action = async (name, args) => {
    switch (name) {
      case 'look': return {};
      case 'observe':
        return { crosshair: broken.length ? { pos: furnace, block: 'minecraft:furnace' }
          : { pos: grass, block: 'minecraft:tall_grass' } };
      case 'get_inventory': return { slots: pickedUp ? [pickaxe, { id: 'minecraft:furnace', count: 1 }] : [pickaxe],
        mainHand: pickaxe };
      case 'break_block': broken.push(args.pos); return { broken: true };
      case 'go_to':
        assert.deepEqual(args.pos, furnace);
        assert.deepEqual(broken, [grass, furnace]);
        pickedUp = true;
        return { arrived: true };
      default: assert.fail(name);
    }
  };
  assert.equal(await recoverPlacedFurnace(action, furnace), true);
  assert.ok(pickedUp);
});

test('a recovery forage keeps the chicken collected through ordinary play', async () => {
  const { forageExpeditionMeal } = await import('./expedition-home.mjs');
  const chicken = { id: 11, type: 'minecraft:chicken', distance: 2, pos: [2, 64, 0] };
  const drop = { id: 12, item: { id: chicken.type }, pos: chicken.pos };
  let hunted = false;
  let collected = false;
  const action = async (name, args) => {
    switch (name) {
      case 'observe':
        return { inWorld: true, health: 20, position: { x: 0, y: 64, z: 0 }, crosshair: { id: chicken.id } };
      case 'get_inventory': return { slots: collected ? [{ id: chicken.type, count: 1 }] : [] };
      case 'get_entities':
        return { entities: args.type === 'item' ? [drop] : hunted ? [] : [chicken] };
      case 'go_to':
        if (args.entityId === drop.id) collected = true;
        else assert.equal(args.entityId, chicken.id);
        return { arrived: true };
      case 'look': return {};
      case 'attack_entity':
        assert.equal(args.entityId, chicken.id);
        hunted = true;
        return {};
      default: assert.fail(`Unexpected action: ${name}`);
    }
  };
  assert.equal(await forageExpeditionMeal(action, { toward: [40, 64, 0] }), true);
  assert.ok(hunted && collected);
});

test('foraging from a ridge follows dry steps toward livestock in the valley', async () => {
  const { forageExpeditionMeal } = await import('./expedition-home.mjs');
  const sheep = { id: 11, type: 'minecraft:sheep', distance: 14, pos: [7, 112, 0] };
  const drop = { id: 12, item: { id: 'minecraft:mutton' }, distance: 2, pos: [5, 118, 0] };
  const ground = [cell(0, 123, 0), ...Array.from({ length: 10 }, (_, x) => cell(-x - 1, 123, 0)),
    ...Array.from({ length: 6 }, (_, x) => cell(x + 1, 122 - x, 0))];
  let moved = false;
  let collected = false;
  const action = async (name, args) => {
    switch (name) {
      case 'observe': return { inWorld: true, onGround: true, health: 20,
        position: moved ? { x: 4.5, y: 120, z: 0.5 } : { x: 0.5, y: 124, z: 0.5 } };
      case 'get_inventory': return { slots: collected ? [{ id: drop.item.id, count: 1 }] : [] };
      case 'get_entities': return { entities: moved ? [drop] : [sheep] };
      case 'get_blocks': return { cells: ground };
      case 'go_to':
        if (args.entityId === drop.id) collected = true;
        else {
          assert.ok(args.pos[0] > 0 && args.pos[1] < 124, 'Take the dry staircase toward observed sheep');
          moved = true;
        }
        return { arrived: true, position: args.pos };
      default: assert.fail(name);
    }
  };
  assert.equal(await forageExpeditionMeal(action), true);
  assert.ok(moved && collected);
});

test('a brief long-range sheep sighting takes priority over an empty route toward camp', async () => {
  const { forageExpeditionMeal } = await import('./expedition-home.mjs');
  const sheep = { id: 21, type: 'minecraft:sheep', distance: 55, pos: [55, 112, 0] };
  const drop = { id: 22, item: { id: 'minecraft:mutton' }, distance: 1, pos: [13, 112, 0] };
  let stride = 0;
  let collected = false;
  const action = async (name, args) => {
    switch (name) {
      case 'observe': return { inWorld: true, onGround: true, health: 20,
        position: { x: 0.5 + stride * 6, y: 112, z: 0.5 } };
      case 'get_inventory': return { slots: collected ? [{ id: drop.item.id, count: 1 }] : [] };
      case 'get_entities': return { entities: stride >= 2 ? [drop] : stride === 0 && args.radius === 64 ? [sheep] : [] };
      case 'get_blocks': return { cells: [
        ...Array.from({ length: 29 }, (_, index) => cell(stride * 6 + index - 14, 111, 0)),
        ...Array.from({ length: 7 }, (_, index) => cell(stride * 6, 110 - index, index + 1)),
      ] };
      case 'go_to':
        if (args.entityId === drop.id) collected = true;
        else {
          assert.ok(args.pos[0] > stride * 6, 'Keep moving toward the last observed sheep');
          stride++;
        }
        return { arrived: true, position: args.pos };
      default: assert.fail(name);
    }
  };
  assert.equal(await forageExpeditionMeal(action, { toward: [-40, 112, 0] }), true);
  assert.equal(stride, 2);
});

test('foraging retries a wounded sheep after it leaves the blocked hillside', async () => {
  const { forageExpeditionMeal } = await import('./expedition-home.mjs');
  const sheep = { id: 31, type: 'minecraft:sheep', distance: 2, pos: [2.5, 64, 0.5] };
  const drop = { id: 32, item: { id: 'minecraft:mutton' }, distance: 2, pos: [8.5, 64, 0.5] };
  let sightings = 0;
  let attempts = 0;
  let moved = false;
  let struck = false;
  let collected = false;
  const action = async (name, args) => {
    switch (name) {
      case 'observe': return { inWorld: true, onGround: true, health: 20,
        position: { x: moved ? 6.5 : 0.5, y: 64, z: 0.5 }, crosshair: moved ? { id: sheep.id } : { type: 'block' } };
      case 'get_inventory': return { slots: collected ? [{ id: drop.item.id, count: 1 }] : [] };
      case 'get_entities':
        if (!args.type && args.radius === 32) sightings++;
        return { entities: args.type === 'item' ? [drop] : struck ? [] : [moved ? { ...sheep, pos: drop.pos } : sheep] };
      case 'get_blocks': return { cells: sightings < 2 ? [] : Array.from({ length: 8 }, (_, x) => cell(x, 63, 0)) };
      case 'go_to':
        if (args.entityId === sheep.id) {
          attempts++;
          assert.ok(attempts === 1 || moved, 'Do not retry unchanged blocked footing');
          return { arrived: moved };
        }
        if (args.entityId === drop.id) collected = true;
        else moved = true;
        return { arrived: true, position: args.pos };
      case 'look': return {};
      case 'attack_entity':
        assert.equal(args.entityId, sheep.id);
        struck = true;
        return {};
      default: assert.fail(name);
    }
  };
  assert.ok(await forageExpeditionMeal(action));
  assert.equal(attempts, 2);
  assert.ok(collected);
});

test('regrouping on a known trail takes short steps before a distant creeper can close', async () => {
  const { regroupExpeditionCompanion } = await import('./expedition-home.mjs');
  const dog = { uuid: 'original', pos: [10.5, 64, 0.5], health: 12 };
  let x = 0.5;
  const action = async (name, args) => {
    switch (name) {
      case 'observe': return { inWorld: true, onGround: true, health: 20, position: { x, y: 64, z: 0.5 },
        threats: [{ id: 12, type: 'minecraft:creeper', distance: 12 }] };
      case 'get_entities':
        assert.equal(args.radius, 128, 'a distant creeper should not restart the same retreat loop');
        return { entities: [{ ...dog, distance: Math.abs(dog.pos[0] - x) }] };
      case 'get_blocks': return { cells: Array.from({ length: 12 }, (_, index) => cell(index, 63, 0, 'grass_block')) };
      case 'go_to':
        assert.equal(args.maxTicks, 12);
        x = Math.min(args.pos[0] + 0.5, x + 2);
        return { arrived: false, position: [x, 64, 0.5] };
      default: assert.fail(`Unexpected action: ${name}`);
    }
  };
  const together = await regroupExpeditionCompanion(action, dog.uuid, dog.pos, [[10, 64, 0], [0, 64, 0]]);
  assert.equal(together.distance, 6);
});

test('a wounded player retreats from a zombie before trying to regroup', async () => {
  const { regroupExpeditionCompanion } = await import('./expedition-home.mjs');
  const dog = { uuid: 'original', pos: [-10.5, 64, 0.5], health: 12 };
  const zombie = { id: 12, type: 'minecraft:zombie', pos: [3, 64, 0.5], distance: 2.5, hostile: true };
  for (const escapeIsOpen of [false, true]) {
    let x = 0.5;
    let retreats = 0;
    const action = async (name, args) => {
      switch (name) {
        case 'observe': return { inWorld: true, onGround: true, health: 5, position: { x, y: 64, z: 0.5 }, threats: [zombie] };
        case 'get_entities': return { entities: args.radius === 128 ? [{ ...dog, distance: Math.abs(dog.pos[0] - x) }] : [zombie] };
        case 'get_blocks': return { cells: Array.from({ length: escapeIsOpen ? 9 : 1 }, (_, i) => cell(-i, 63, 0, 'grass_block')) };
        case 'set_reflexes': return { interruptOnDamage: true };
        case 'go_to':
          assert.ok(args.pos[0] < 0, 'Retreat must increase distance from the pursuing zombie');
          assert.ok(args.maxTicks <= 40);
          x = args.pos[0] + 0.5;
          retreats++;
          return { arrived: true, position: [x, 64, 0.5] };
        default: assert.fail(`Unexpected action: ${name}`);
      }
    };
    if (escapeIsOpen) {
      assert.equal((await regroupExpeditionCompanion(action, dog.uuid, dog.pos)).uuid, dog.uuid);
    } else {
      await assert.rejects(regroupExpeditionCompanion(action, dog.uuid, dog.pos), /unsafe during regrouping/);
    }
    assert.equal(retreats, Number(escapeIsOpen));
  }
});

test('a regroup climb can cut dry headroom instead of taking the same staircase down', async () => {
  const { regroupExpeditionCompanion } = await import('./expedition-home.mjs');
  const dog = { uuid: 'original', pos: [2.5, 65, 0.5], health: 12, distance: 4.5 };
  const pick = { id: 'minecraft:stone_pickaxe', slot: 0, count: 1, maxDamage: 131 };
  const walls = [cell(0, 63, 0, 'stone'), cell(1, 62, 0, 'stone'), cell(1, 63, 0, 'stone')];
  const broken = [];
  let aim;
  let stoodOnStep = false;
  const action = async (name, args) => {
    switch (name) {
      case 'observe': return { inWorld: true, onGround: true, health: 20,
        position: stoodOnStep ? { x: 1.5, y: 62, z: 0.5 } : { x: 0.5, y: 61, z: 0.5 },
        crosshair: aim && { pos: aim, block: 'minecraft:stone' } };
      case 'get_entities': return { entities: [dog] };
      case 'get_inventory': return { mainHand: pick, slots: [pick] };
      case 'get_blocks': return { cells: [cell(0, 60, 0, 'stone'), cell(-1, 59, 0, 'stone'),
        cell(1, 61, 0, 'stone'), ...walls] };
      case 'look': aim = args.at; return {};
      case 'break_block': broken.push(args.pos); return { broken: true };
      case 'go_to':
        assert.deepEqual(args.pos, [1, 62, 0]);
        stoodOnStep = true;
        return { arrived: true, position: [1.5, 62, 0.5] };
      default: assert.fail(name);
    }
  };
  assert.equal(await regroupExpeditionCompanion(action, dog.uuid, dog.pos), dog);
  assert.deepEqual(broken, [[0, 63, 0], [1, 63, 0], [1, 62, 0]]);
});

test('companion forage checks again after regrouping before looking for food', async () => {
  const { forageExpeditionMeal } = await import('./expedition-home.mjs');
  const player = { inWorld: true, health: 20, position: { x: 912, y: 72, z: 205 } };
  let checked = 0;
  let searched = 0;
  let collected = false;
  const action = async (name, args) => {
    switch (name) {
      case 'observe': return player;
      case 'get_inventory': return { slots: collected ? [{ id: 'minecraft:mutton', count: 1 }] : [] };
      case 'get_entities':
        assert.equal(checked, 2, 'Searching for food before regrouping would leave Mushroom below the quarry');
        searched++;
        return { entities: [{ id: 12, item: { id: 'minecraft:mutton' }, pos: [914, 72, 205], distance: 2 }] };
      case 'go_to':
        assert.equal(args.entityId, 12);
        collected = true;
        return { arrived: true };
      default: assert.fail(`Unexpected action: ${name}`);
    }
  };
  assert.equal(await forageExpeditionMeal(action, {
    regroup: async current => {
      assert.equal(current, player);
      checked++;
      return checked === 1;
    },
  }), true);
  assert.equal(searched, 1);
});

test('repeated nighttime regrouping pauses forage until daylight', async () => {
  const { forageExpeditionMeal } = await import('./expedition-home.mjs');
  const drop = { id: 12, item: { id: 'minecraft:mutton' }, pos: [914, 72, 205], distance: 2 };
  let rested = false;
  let regroups = 0;
  let collected = false;
  const action = async (name, args) => {
    switch (name) {
      case 'observe': return { inWorld: true, dimension: 'minecraft:overworld', health: 20,
        timeOfDay: rested ? 100 : 13_900, position: { x: 912, y: 72, z: 205 } };
      case 'get_inventory': return { slots: collected ? [{ id: drop.item.id, count: 1 }] : [] };
      case 'get_entities':
        assert.ok(rested, 'Do not resume the same nighttime forage');
        return { entities: [drop] };
      case 'go_to':
        assert.equal(args.entityId, drop.id);
        collected = true;
        return { arrived: true };
      default: assert.fail(name);
    }
  };
  assert.ok(await forageExpeditionMeal(action, {
    regroup: async () => { regroups++; return !rested; },
    restUntilDaylight: async () => {
      assert.equal(regroups, 2);
      rested = true;
    },
  }));
  assert.ok(collected);
});

test('daylight forage tries a different trail after a walk separates Mushroom', async () => {
  const { forageExpeditionMeal } = await import('./expedition-home.mjs');
  const sheep = { id: 8, type: 'minecraft:sheep', pos: [15, 64, 0], distance: 15 };
  const drop = { id: 12, item: { id: 'minecraft:mutton' }, pos: [-4, 64, 0], distance: 2 };
  const ground = Array.from({ length: 19 }, (_, index) => cell(index - 9, 63, 0, 'grass_block'));
  const steps = [];
  let x = 0;
  let collected = false;
  const action = async (name, args) => {
    switch (name) {
      case 'observe': return { inWorld: true, onGround: true, dimension: 'minecraft:overworld', health: 20,
        timeOfDay: 1_200, position: { x: x + 0.5, y: 64, z: 0.5 } };
      case 'get_inventory': return { slots: collected ? [{ id: drop.item.id, count: 1 }] : [] };
      case 'get_entities': return { entities: x < 0 ? [drop] : [sheep] };
      case 'get_blocks': return { cells: ground };
      case 'go_to':
        if (args.entityId === drop.id) collected = true;
        else {
          x = args.pos[0];
          steps.push(Math.sign(x));
          assert.ok(steps.length === 1 || x < 0, 'The player repeated the route that separated Mushroom');
        }
        return { arrived: true, position: [x, 64, 0] };
      default: assert.fail(`Unexpected action: ${name}`);
    }
  };
  assert.ok(await forageExpeditionMeal(action, {
    regroup: async () => {
      if (x <= 0) return false;
      x = 0;
      return true;
    },
  }));
  assert.deepEqual(steps, [1, -1]);
});

test('the reserved recovery meal moves out of reach of automatic hotbar eating', async () => {
  const { packRecoveryMeal } = await import('./expedition-home.mjs');
  const actions = [];
  await packRecoveryMeal(async (name, args) => {
    actions.push([name, args]);
    if (name === 'get_inventory') return { slots: [
      { slot: 2, id: 'minecraft:beef', count: 1 },
      { slot: 9, id: 'minecraft:stick', count: 2 },
    ] };
    return {};
  });
  assert.deepEqual(actions, [
    ['get_inventory', undefined],
    ['stop', { closeScreen: true }],
    ['click_slot', { slot: 10, action: 'swap', hotbar: 2 }],
  ]);
});

test('feeding only succeeds when the original dog is reached and consumes one meal', async () => {
  const { feedAdoptedDog } = await import('./expedition-home.mjs');
  for (const [hit, accepted, inPlace] of [[19, true], [22, true], [22, false], [22, true, true], [null, true, true]]) {
    let count = 2;
    const dog = { id: 22, uuid: 'original', distance: 2, pos: [2, 64, 0] };
    const decoy = { ...dog, id: 19, uuid: 'other' };
    const action = async (name, args) => {
      switch (name) {
        case 'observe': return { onGround: true, position: { x: 0, y: 64, z: 0 },
          crosshair: hit === null ? { pos: [1, 64, 0], block: 'minecraft:stone' } : { id: hit } };
        case 'get_entities': return { entities: [decoy, dog] };
        case 'get_inventory': return { mainHand: { id: 'minecraft:mutton' }, slots: [{ id: 'minecraft:mutton', count }] };
        case 'look':
          assert.equal(args.entityId, dog.id);
          return {};
        case 'interact_entity':
          assert.equal(args.entityId, dog.id);
          count--;
          return { success: accepted };
        default: throw new Error(`Unexpected action: ${name}`);
      }
    };
    assert.equal(await feedAdoptedDog(action, dog.uuid, [0, 64, 0], 1, { inPlace }), hit === dog.id && accepted);
    assert.equal(count, hit === dog.id ? 1 : 2);
  }
});

test('a feeding approach that times out after moving does not backtrack from stale footing', async () => {
  const { feedAdoptedDog } = await import('./expedition-home.mjs');
  let approached = false;
  let meals = 1;
  const action = async (name, args) => {
    switch (name) {
      case 'observe':
        return { inWorld: true, position: { x: approached ? 6 : 0, y: 64, z: 0 }, crosshair: { id: 22 } };
      case 'get_entities':
        return { entities: [{ id: 22, uuid: 'original', pos: [8, 64, 0], distance: approached ? 2 : 8 }] };
      case 'get_inventory':
        return { mainHand: { id: 'minecraft:mutton' }, slots: [{ id: 'minecraft:mutton', count: meals }] };
      case 'go_to':
        assert.equal(args.entityId, 22);
        approached = true;
        return { arrived: false, reason: 'timed out 2.3 blocks away' };
      case 'look':
        assert.equal(args.entityId, 22);
        return {};
      case 'interact_entity':
        assert.equal(args.entityId, 22);
        meals--;
        return { success: true };
      default:
        assert.fail(`Unexpected action: ${name}`);
    }
  };
  assert.equal(await feedAdoptedDog(action, 'original', [0, 64, 0], 9), true);
  assert.equal(meals, 0);
});

test('a nearby dog behind a ledge gets fed after walking around the obstruction', async () => {
  const { feedAdoptedDog } = await import('./expedition-home.mjs');
  const meat = 'minecraft:mutton';
  const dog = { id: 22, uuid: 'original', pos: [2.1, 66, 0.5], distance: 1.89, health: 12 };
  const obstacle = [1, 67, 0];
  const footing = [cell(0, 66, 0), cell(...obstacle, 'obsidian'), cell(0, 66, 1),
    cell(1, 65, 1), cell(2, 65, 1), cell(2, 65, 0)];
  let rounds = 0;
  let meals = 2;
  let moved = false;
  const action = async (name, args) => {
    switch (name) {
      case 'observe':
        return { inWorld: true, onGround: true, health: 20,
          position: { x: 0.5, y: 67, z: moved ? 1.5 : 0.5 },
          crosshair: moved ? { id: dog.id } : { pos: obstacle, block: 'minecraft:obsidian' } };
      case 'get_inventory':
        return { mainHand: { id: meat }, slots: [{ id: meat, count: meals }] };
      case 'get_entities':
        return { entities: [dog] };
      case 'look':
        return {};
      case 'get_blocks':
        return { cells: footing };
      case 'go_to':
        if (args.entityId === dog.id) {
          rounds++;
          return { arrived: true, ticks: 0, position: [0.5, 67, 0.5] };
        }
        assert.deepEqual(args.pos, [0, 67, 1]);
        moved = true;
        return { arrived: true, ticks: 9, position: [0.5, 67, 1.5] };
      case 'interact_entity':
        assert.equal(args.entityId, dog.id);
        assert.ok(moved);
        meals--;
        return { success: true };
      default:
        assert.fail(`Unexpected action: ${name}`);
    }
  };
  assert.equal(await feedAdoptedDog(action, dog.uuid, [0, 67, 0], 9), true);
  assert.equal(rounds, 0);
  assert.equal(meals, 1);
});

test('a nearby Mushroom can be fed through a cleared stone shelf with safe footing', async () => {
  const { feedAdoptedDog } = await import('./expedition-home.mjs');
  const dog = { id: 22, uuid: 'original', pos: [-78.5, 66, -82.05], distance: 2.08, health: 12 };
  const ledge = [-80, 67, -82];
  const meat = 'minecraft:mutton';
  const pickaxe = 'minecraft:stone_pickaxe';
  for (const hazardous of [true, false]) {
    let held = meat;
    let cleared = false;
    let meals = 3;
    const action = async (name, args) => {
      switch (name) {
        case 'observe':
          return { inWorld: true, onGround: true, health: 20, position: { x: -79.46, y: 67, z: -80.5 },
            crosshair: cleared ? { id: dog.id } : { pos: ledge, block: 'minecraft:stone' } };
        case 'get_entities':
          return { entities: [dog] };
        case 'look':
          return {};
        case 'get_inventory':
          return { mainHand: { id: held }, slots: [{ id: meat, count: meals, slot: 0 },
            { id: pickaxe, count: 1, maxDamage: 131, slot: 1 }] };
        case 'get_blocks':
          assert.deepEqual(args.center, ledge);
          return { cells: hazardous ? [cell(-80, 68, -82, 'water')] : [cell(...ledge, 'stone')] };
        case 'select_slot':
          held = args.slot === 1 ? pickaxe : meat;
          return { mainHand: { id: held } };
        case 'break_block':
          assert.deepEqual(args.pos, ledge);
          assert.equal(held, pickaxe);
          cleared = true;
          return { broken: true };
        case 'interact_entity':
          assert.ok(cleared);
          assert.equal(args.entityId, dog.id);
          assert.equal(held, meat);
          meals--;
          return { success: true };
        default:
          assert.fail(`Unexpected action: ${name}`);
      }
    };
    assert.equal(await feedAdoptedDog(action, dog.uuid, [-80, 67, -81], 2), !hazardous);
    assert.equal(cleared, !hazardous);
    assert.equal(meals, hazardous ? 3 : 2);
  }
});

test('grass in the feeding sightline can be cleared before using one meal on Mushroom', async () => {
  const { feedAdoptedDog } = await import('./expedition-home.mjs');
  const meat = 'minecraft:mutton';
  const dog = { id: 22, uuid: 'original', pos: [3.5, 64, 0.5], distance: 3 };
  const obstacle = [2, 64, 0];
  let foliageCleared = false;
  let meals = 2;
  const action = async (name, args) => {
    switch (name) {
      case 'observe':
        return { inWorld: true, health: 20, position: { x: 0.5, y: 64, z: 0.5 },
          crosshair: foliageCleared ? { id: dog.id } : { block: 'minecraft:short_grass', pos: obstacle } };
      case 'get_entities':
        return { entities: [dog] };
      case 'get_inventory':
        return { mainHand: { id: meat }, slots: [{ id: meat, slot: 0, count: meals }] };
      case 'look':
        return {};
      case 'break_block':
        assert.deepEqual(args.pos, obstacle);
        foliageCleared = true;
        return { broken: true };
      case 'select_slot':
        return { mainHand: { id: meat } };
      case 'interact_entity':
        assert.ok(foliageCleared);
        assert.equal(args.entityId, dog.id);
        meals--;
        return { success: true };
      default:
        assert.fail(`Unexpected action: ${name}`);
    }
  };
  assert.equal(await feedAdoptedDog(action, dog.uuid, [0, 64, 0], 2), true);
  assert.equal(meals, 1);
});

test('a feeding attempt walks away from a zombie before offering the meal', async () => {
  const { feedAdoptedDog } = await import('./expedition-home.mjs');
  const threat = { id: 12, type: 'minecraft:zombie_villager', pos: [1.5, 1, 0.5], distance: 1, hostile: true };
  const dog = { id: 22, uuid: 'original', pos: [-7.5, 1, 0.5], distance: 1 };
  let retreated = false;
  let meals = 1;
  const reflexChanges = [];
  const action = async (name, args) => {
    switch (name) {
      case 'observe':
        return { inWorld: true, health: 12, position: { x: retreated ? -8.5 : 0.5, y: 1, z: 0.5 },
          threats: retreated ? [] : [threat], crosshair: { id: dog.id } };
      case 'get_inventory':
        return { mainHand: { id: 'minecraft:mutton' }, slots: [{ id: 'minecraft:mutton', count: meals }] };
      case 'get_entities':
        return { entities: args.type ? [dog] : [threat] };
      case 'set_reflexes':
        if (args) reflexChanges.push(args.interruptOnDamage);
        return { interruptOnDamage: true };
      case 'get_blocks':
        return { cells: Array.from({ length: 10 }, (_, x) => cell(-x, 0, 0)) };
      case 'go_to':
        assert.ok(args.pos[0] < 0);
        assert.equal(args.maxTicks, 40);
        assert.deepEqual(reflexChanges, [false]);
        retreated = true;
        return { arrived: true, position: [-8.5, 1, 0.5] };
      case 'look':
        return {};
      case 'interact_entity':
        assert.ok(retreated);
        assert.equal(args.entityId, dog.id);
        meals--;
        return { success: true };
      default:
        assert.fail(`Unexpected action: ${name}`);
    }
  };
  assert.equal(await feedAdoptedDog(action, dog.uuid, [0, 1, 0], 2), true);
  assert.equal(meals, 0);
  assert.deepEqual(reflexChanges, [false, true]);
});

test('a rock blocking the feeding approach is mined with a pickaxe before offering the meal', async () => {
  const { feedAdoptedDog } = await import('./expedition-home.mjs');
  const meat = 'minecraft:mutton';
  const pickaxe = 'minecraft:stone_pickaxe';
  const dog = { id: 22, uuid: 'original', pos: [4.5, 64, 0.5], distance: 4 };
  const block = [1, 64, 0];
  let mainHand = meat;
  let meals = 2;
  let cleared = false;
  let breaking = false;
  const action = async (name, args) => {
    switch (name) {
      case 'observe':
        return { inWorld: true, health: 20, position: { x: 0.5, y: 64, z: 0.5 }, crosshair: cleared
          ? { id: dog.id } : breaking ? { pos: block, block: 'minecraft:stone' } : {} };
      case 'get_inventory':
        return { mainHand: { id: mainHand }, slots: [
          { slot: 0, id: meat, count: meals }, { slot: 1, id: pickaxe, count: 1, maxDamage: 131 },
        ] };
      case 'get_entities':
        return { entities: [dog] };
      case 'go_to':
        assert.equal(args.entityId, dog.id);
        return { arrived: false, reason: 'blocked by minecraft:stone at 1,64,0' };
      case 'get_blocks':
        assert.deepEqual(args.center, block);
        return { cells: [cell(...block)], stats: { unloadedChunks: 0 } };
      case 'look':
        breaking = Boolean(args.at);
        return {};
      case 'select_slot':
        mainHand = args.slot === 1 ? pickaxe : meat;
        return { mainHand: { id: mainHand } };
      case 'break_block':
        assert.deepEqual(args.pos, block);
        assert.equal(mainHand, pickaxe);
        cleared = true;
        return { broken: true };
      case 'interact_entity':
        assert.equal(args.entityId, dog.id);
        assert.equal(mainHand, meat);
        meals--;
        return { success: true };
      default:
        assert.fail(`Unexpected action: ${name}`);
    }
  };
  assert.equal(await feedAdoptedDog(action, dog.uuid, [0, 64, 0], 9), true);
  assert.equal(meals, 1);
});

test('forest-floor litter can be cleared for a bed with two dry supports', async () => {
  const { buildingSpotsWithGroundCover, nearbyBuildingSpots } = await import('./expedition-navigation.mjs');
  const position = { x: 0.15, y: 1, z: 0.5 };
  const blocks = [cell(1, 0, 0), cell(2, 0, 0), cell(1, 1, 0, 'leaf_litter'),
    cell(2, 1, 0, 'short_grass'), cell(1, 0, 1), cell(1, 1, 1, 'water')];
  assert.deepEqual(nearbyBuildingSpots(blocks, position, true), []);
  assert.deepEqual(buildingSpotsWithGroundCover(blocks, position, true), [
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
  const { settleOnDryStep } = await import('./expedition-home.mjs');
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
  assert.equal(await settleOnDryStep(action, landing, async () => {}), true);
  assert.equal(reports.length, 0);
});

test('a stair landing that drifts into the next column is not recorded as settled', async () => {
  const { settleOnDryStep } = await import('./expedition-home.mjs');
  const landing = [161, 81, 160];
  const readings = [161.99, 162.03];
  const action = async name => {
    assert.equal(name, 'observe');
    return { inWorld: true, health: 20, onGround: true,
      position: { x: readings.shift(), y: 81, z: 160.5 } };
  };
  assert.equal(await settleOnDryStep(action, landing, async () => {}, true), false);
  assert.equal(readings.length, 0);
});

test('a grounded stair landing gets time for lateral drift to settle within its column', async () => {
  const { settleOnDryStep } = await import('./expedition-home.mjs');
  const landing = [298, 57, 115];
  const readings = [[298.52, 115.64], [298.50, 115.53], [298.48, 115.36], [298.537, 115.31],
    [298.648, 115.32], [298.7, 115.36], [298.7, 115.41], [298.7, 115.47], [298.7, 115.59],
    [298.7, 115.699], [298.7, 115.7]];
  let sample = 0;
  const action = async name => {
    assert.equal(name, 'observe');
    if (sample === readings.length) return null;
    const [x, z] = readings[sample++];
    return { inWorld: true, health: 20, onGround: sample > 3,
      position: { x, y: sample > 3 ? 57 : 57.6, z } };
  };
  assert.equal(await settleOnDryStep(action, landing, async () => {}, true), true);
  assert.equal(sample, readings.length);
});

test('a long return after feeding plans for dusk before it takes the exposed route', async () => {
  const { careReturnNeedsCover } = await import('./expedition-home.mjs');
  const native = { dimension: 'minecraft:overworld', position: { x: 190.35, y: 74, z: 119.5 }, timeOfDay: 13_628 };
  const bed = [-12, 63, -6];
  assert.equal(careReturnNeedsCover(native, bed), true);
  assert.equal(careReturnNeedsCover({ ...native, timeOfDay: 11_000 }, bed), true);
  assert.equal(careReturnNeedsCover({ ...native, timeOfDay: 6_000 }, bed), false);
  assert.equal(careReturnNeedsCover({ ...native, timeOfDay: 23_700 }, bed), false);
  assert.equal(careReturnNeedsCover(native, [183, 76, 119]), false);
});

test('the sheep scout waits for its only dry descent instead of rejecting it at the rim', async () => {
  const { stepOut } = await import('./expedition-home.mjs');
  const start = { x: 306.65, y: 67, z: 438.5 };
  const landing = [307, 66, 438];
  const ground = [cell(306, 66, 438), cell(307, 65, 438), cell(306, 64, 439)];
  const player = { position: start, onGround: true, inWorld: true, health: 11 };
  const observations = [
    { ...player, position: { x: 307.34, y: 67, z: 438.54 } },
    { ...player, onGround: false, position: { x: 307.43, y: 66.77, z: 438.55 } },
    { ...player, position: { x: 307.5, y: 66, z: 438.55 } },
  ];
  const rejected = new Set();
  const action = async (name, args) => {
    if (name === 'get_blocks') return { cells: ground };
    if (name === 'observe') return observations.shift();
    assert.equal(name, 'go_to');
    assert.deepEqual(args.pos, landing);
    return { arrived: true, position: [307.23, 67, 438.54] };
  };
  assert.equal(await stepOut(action, player, [], [335.31, 65, 464.24], undefined, rejected), true);
  assert.equal(observations.length, 0);
  assert.equal(rejected.size, 0);
});

test('an exhausted quarry remains skipped after reattachment until its blocked footing changes', async () => {
  const { quarryFooting, repeatedQuarryEntrance } = await import('./expedition-home.mjs');
  const entrance = [911, 73, 205];
  const blockedAt = [915, 66, 208];
  let blocks = [cell(915, 65, 208, 'stone'), cell(916, 66, 208, 'water')];
  const action = async (name, args) => {
    assert.equal(name, 'get_blocks');
    assert.deepEqual(args.center, blockedAt);
    return { cells: blocks };
  };
  const restored = JSON.parse(JSON.stringify([{ entrance, blockedAt, footing: await quarryFooting(action, blockedAt) }]));
  blocks = blocks.toReversed();
  assert.equal(await repeatedQuarryEntrance(action, [913, 73, 205], restored), true);
  assert.equal(await repeatedQuarryEntrance(action, [919, 73, 205], restored), false);
  blocks = blocks.filter(block => block.b !== 'minecraft:water');
  assert.equal(await repeatedQuarryEntrance(action, entrance, restored), false);
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

test('iron work sleeps before a nighttime forage when the player has no meal', async () => {
  const { earnIronKit } = await import('./expedition-home.mjs');
  const resumed = new Error('Companion checked after dawn');
  const bed = [2, 1, 0];
  let slept = false;
  const action = async (name, args) => {
    switch (name) {
      case 'get_inventory': return { slots: [] };
      case 'observe': return { inWorld: true, dimension: 'minecraft:overworld', health: 20, food: 17,
        position: { x: 0.5, y: 1, z: 0.5 }, timeOfDay: slept ? 20 : 15_000, gameTime: 26_000 };
      case 'get_blocks': return { cells: [cell(...bed, 'red_bed')] };
      case 'interact_block':
        assert.deepEqual(args.pos, bed);
        slept = true;
        return { screenOpened: 'InBedChatScreen' };
      default: assert.fail(`Unexpected action: ${name}`);
    }
  };
  await assert.rejects(earnIronKit(action, () => assert.fail('No recipe has ingredients'), { bed }, {
    checkCompanion: async player => {
      assert.equal(player.timeOfDay, 20, 'An available bed should come before the nighttime care search');
      throw resumed;
    },
  }), error => error === resumed);
});

test('a hungry miner collects food and keeps the original dog’s portion', async () => {
  const { earnIronKit } = await import('./expedition-home.mjs');
  const mutton = { slot: 1, id: 'minecraft:mutton', count: 2 };
  const resumed = new Error('Resumed with one portion in reserve');
  let collected = false;
  let ate = false;
  const action = async (name, args) => {
    switch (name) {
      case 'get_inventory':
        if (ate) throw resumed;
        return { slots: collected ? [mutton] : [] };
      case 'observe': return { inWorld: true, dimension: 'minecraft:overworld', health: 20, food: 14,
        position: { x: 0.5, y: 64, z: 0.5 }, timeOfDay: 300, gameTime: 26_000 };
      case 'get_entities': return { entities: [{ id: 14, item: mutton, distance: 2, pos: [2, 64, 0] }] };
      case 'go_to':
        assert.equal(args.entityId, 14);
        collected = true;
        return { arrived: true };
      case 'look': return {};
      case 'select_slot': return { mainHand: mutton };
      case 'use_item':
        ate = true;
        return { completed: true, food: 16 };
      default: assert.fail(name);
    }
  };
  await assert.rejects(earnIronKit(action, () => assert.fail('No recipe has ingredients'), { bed: [0, 64, 0] },
    { reserveCompanionMeal: true }), error => error === resumed);
  assert.ok(collected && ate);
});

test('iron work returns to camp after feeding the injured companion before spending another portion', async () => {
  const { earnIronKit } = await import('./expedition-home.mjs');
  const checkedAt = [];
  let caredFor = false;
  let x = 0;
  let gameTime = 0;
  const atCamp = new Error('The companion was checked again at camp');
  const action = async name => {
    switch (name) {
      case 'get_inventory': return { slots: [] };
      case 'observe':
        gameTime += 50;
        return { inWorld: true, position: { x: x + 0.5, y: 1, z: 0.5 }, health: 20, food: 20, gameTime };
      default: assert.fail(`Unexpected action: ${name}`);
    }
  };
  const policy = {
    checkCompanion: async () => {
      checkedAt.push(x);
      if (x === 8) throw atCamp;
      return 'care';
    },
    tendCompanion: async () => {
      assert.equal(x, 0);
      assert.equal(caredFor, false);
      caredFor = true;
      return true;
    },
    returnAfterCare: async () => {
      assert.ok(caredFor);
      assert.equal(x, 0);
      x = 8;
    },
  };
  await assert.rejects(earnIronKit(action, () => assert.fail('No recipe has ingredients'), {
    bed: [8, 1, 0],
  }, policy), error => error === atCamp);
  assert.deepEqual(checkedAt, [0, 8]);
});

test('companion meals do not erase the iron search history', async () => {
  const { earnIronKit } = await import('./expedition-home.mjs');
  const pickaxe = { id: 'minecraft:stone_pickaxe', slot: 0, count: 1, maxDamage: 131 };
  let x = 0;
  let gameTime = 0;
  let checks = 0;
  let meals = 0;
  const digging = new Error('Reached the supported staircase fallback');
  const action = async (name, args) => {
    switch (name) {
      case 'get_inventory': return { slots: [pickaxe], mainHand: pickaxe };
      case 'observe':
        gameTime += 50;
        return { inWorld: true, onGround: true, position: { x: x + 0.5, y: 1, z: 0.5 },
          health: 20, food: 20, gameTime };
      case 'get_blocks': return { cells: Array.from({ length: 23 }, (_, offset) => cell(x + offset - 11, 0, 0)) };
      case 'go_to':
        x = args.pos[0];
        return { arrived: true, position: args.pos };
      default: assert.fail(`Unexpected action: ${name}`);
    }
  };
  await assert.rejects(earnIronKit(action, () => assert.fail('No recipe has ingredients'), { bed: [0, 1, 0] }, {
    checkCompanion: async () => ++checks % 4 === 0 ? 'care' : null,
    tendCompanion: async () => { meals++; return false; },
    chooseWork: async (_player, _progress, fallback) => {
      if (fallback === 'quarry') throw digging;
      return fallback;
    },
  }), error => error === digging);
  assert.ok(meals >= 2);
});

test('daylight feeding reuses the quarry while a care trip home takes priority', async () => {
  const { earnIronKit } = await import('./expedition-home.mjs');
  const entry = [0, 64, 0];
  const landing = [1, 63, 0];
  const pickaxe = { id: 'minecraft:stone_pickaxe', slot: 0, count: 1, maxDamage: 131 };
  for (const returnHome of [false, true]) {
    const endpoint = new Error('Reached the next care decision');
    const walks = [];
    const saves = [];
    let position = landing;
    let cared = false;
    let gameTime = 0;
    const action = async (name, args) => {
      if (name === 'observe') {
        const [x, y, z] = position;
        return { inWorld: true, onGround: true, health: 20, food: 20, gameTime: gameTime += 50,
          position: { x: x + 0.5, y, z: z + 0.5 } };
      }
      if (name === 'get_inventory') return { slots: [pickaxe], mainHand: pickaxe };
      if (name === 'get_blocks') return { cells: [cell(0, 63, 0, 'stone'), cell(1, 62, 0, 'granite')] };
      if (name === 'go_to') {
        position = args.pos;
        walks.push(position);
        return { arrived: true, position };
      }
      assert.fail(name);
    };
    await assert.rejects(earnIronKit(action, () => assert.fail('No ore to smelt'), { bed: [-20, 64, 0] }, {
      resumeQuarry: [entry],
      resumeQuarryLanding: landing,
      checkCompanion: async () => {
        if (cared) throw endpoint;
        return 'care';
      },
      tendCompanion: async () => {
        assert.deepEqual(position, entry);
        cared = true;
        return returnHome;
      },
      returnAfterCare: async () => { assert.ok(returnHome); throw endpoint; },
      saveQuarry: async (stairs, at, reenter) => saves.push([[...stairs], at, Boolean(reenter)]),
    }), error => error === endpoint);
    assert.deepEqual(walks, returnHome ? [entry] : [entry, landing]);
    assert.deepEqual(saves, returnHome ? [[[], undefined, false]]
      : [[[], undefined, false], [[entry], landing, true], [[entry], landing, false]]);
  }
});

test('a reachable Mushroom eats at the quarry landing before any return climb', async () => {
  const { earnIronKit } = await import('./expedition-home.mjs');
  const entry = [0, 64, 0];
  const landing = [1, 63, 0];
  const pickaxe = { id: 'minecraft:stone_pickaxe', slot: 0, count: 1, maxDamage: 131 };
  const meal = { id: 'minecraft:mutton', slot: 1, count: 1 };
  for (const fedInPlace of [false, true]) {
    for (const returnHome of [false, true]) {
      const endpoint = new Error('Reached the next care decision');
      const events = [];
      let position = landing;
      let cared = false;
      let gameTime = 0;
      const action = async (name, args) => {
        if (name === 'observe') {
          const [x, y, z] = position;
          return { inWorld: true, onGround: true, health: 20, food: 20, gameTime: gameTime += 50,
            position: { x: x + 0.5, y, z: z + 0.5 } };
        }
        if (name === 'get_inventory') return { slots: [pickaxe, meal], mainHand: pickaxe };
        if (name === 'get_blocks') return { cells: [cell(0, 63, 0, 'stone'), cell(1, 62, 0, 'granite')] };
        assert.equal(name, 'go_to');
        position = args.pos;
        events.push(position[1] === entry[1] ? 'climb' : 'descend');
        return { arrived: true, position };
      };
      await assert.rejects(earnIronKit(action, () => assert.fail('No ore to smelt'), { bed: [-20, 64, 0] }, {
        resumeQuarry: [entry],
        resumeQuarryLanding: landing,
        checkCompanion: async () => {
          if (cared) throw endpoint;
          return 'care';
        },
        tendCompanion: async ({ inQuarry } = {}) => {
          if (inQuarry) {
            assert.deepEqual(position, landing);
            events.push('offer');
            if (!fedInPlace) return undefined;
          } else {
            assert.deepEqual(position, entry);
            events.push('forage');
          }
          cared = true;
          return returnHome;
        },
        returnAfterCare: async () => { events.push('return'); throw endpoint; },
      }), error => error === endpoint);
      const expected = ['offer'];
      if (!fedInPlace) expected.push('climb', 'forage');
      if (returnHome) expected.push(...(fedInPlace ? ['climb', 'return'] : ['return']));
      else if (!fedInPlace) expected.push('descend');
      assert.deepEqual(events, expected);
    }
  }
});

test('a worn pick is replaced on the surface before returning to the same quarry', async () => {
  const { earnIronKit } = await import('./expedition-home.mjs');
  const entrance = [0, 64, 0];
  const landing = [1, 63, 0];
  const worn = { id: 'minecraft:stone_pickaxe', slot: 0, count: 1, maxDamage: 131, damage: 124 };
  const fresh = { ...worn, slot: 1, damage: 0 };
  const table = { id: 'minecraft:crafting_table', slot: 4, count: 1 };
  for (const fromSurface of [false, true]) {
    const resume = new Error('Back at the original landing with a fresh pick');
    let at = fromSurface ? entrance : landing;
    let mainHand = worn;
    const slots = [worn, { id: 'minecraft:cobblestone', slot: 2, count: 32 },
      { id: 'minecraft:oak_planks', slot: 3, count: 6 }, { id: 'minecraft:stick', slot: 5, count: 2 }];
    const walked = [];
    const saves = [];
    const action = async (name, args) => {
      switch (name) {
        case 'observe': return { inWorld: true, onGround: true, health: 20, food: 20, gameTime: at === landing ? 80 : 120,
          position: { x: at[0] + 0.5, y: at[1], z: at[2] + 0.5 } };
        case 'get_inventory': return { slots, mainHand };
        case 'get_blocks': return { cells: [cell(0, 63, 0, 'stone'), cell(1, 62, 0, 'stone'), cell(0, 63, 2, 'stone')] };
        case 'select_slot': mainHand = slots.find(stack => stack.slot === args.slot); return { mainHand };
        case 'place_block':
          assert.deepEqual(args.pos, [0, 64, 2], 'Keep the entrance and staircase clear');
          return { placed: true, blockAtPos: table.id };
        case 'interact_block': return { screenOpened: 'CraftingScreen' };
        case 'stop': return {};
        case 'go_to':
          at = String(args.pos) === String(entrance) ? entrance : landing;
          walked.push(at);
          return { arrived: true, position: at };
        default: assert.fail(name);
      }
    };
    const craft = async item => {
      assert.equal(at, entrance);
      if (item === table.id) slots.push(table);
      else if (item === fresh.id) slots.push(fresh);
      else assert.fail(item);
    };
    await assert.rejects(earnIronKit(action, craft, { bed: [-10, 64, 0] }, {
      resumeQuarry: [entrance], resumeQuarryLanding: landing, reenterQuarry: fromSurface,
      checkCompanion: async () => {},
      saveQuarry: async (route, lower, reenter) => {
        saves.push([[...route], lower, Boolean(reenter)]);
        if (!reenter) {
          assert.equal(at, landing);
          assert.equal(mainHand, fresh);
          throw resume;
        }
      },
      saveExhaustedQuarries: async () => assert.fail('A worn pick does not exhaust the quarry'),
    }), error => error === resume);
    assert.deepEqual(walked, fromSurface ? [landing] : [entrance, landing]);
    assert.deepEqual(saves, fromSurface ? [[[entrance], landing, false]]
      : [[[entrance], landing, true], [[entrance], landing, false]]);
  }
});

test('reentering a quarry can recover from drift across dry footing', async () => {
  const { earnIronKit } = await import('./expedition-home.mjs');
  const entrance = [0, 64, 0];
  const first = [1, 63, 0];
  const second = [2, 62, 0];
  const landing = [3, 61, 0];
  const side = [1, 63, 1];
  const stairs = [entrance, first, second];
  const pickaxe = { id: 'minecraft:stone_pickaxe', slot: 0, count: 1, maxDamage: 131 };
  for (const drift of ['downhill', 'water', 'side']) {
    const wet = drift === 'water';
    const surface = [cell(0, 63, 0, 'stone'), cell(1, 62, 0, 'stone'), cell(2, 61, 0, 'stone'),
      cell(3, 60, 0, 'stone'), ...(wet ? [cell(2, 62, 0, 'water')] : []),
      ...(drift === 'side' ? [cell(1, 62, 1, 'stone')] : [])];
    const reachedIronSearch = new Error('Reached iron work');
    const walks = [];
    const saves = [];
    let at = entrance;
    const action = async (name, args) => {
      if (name === 'get_blocks') return { cells: surface };
      if (name === 'get_inventory') return { slots: [pickaxe], mainHand: pickaxe };
      if (name === 'observe') return { inWorld: true, onGround: true, inWater: wet && at === second,
        health: 20, food: 20, gameTime: 100, position: { x: at[0] + 0.5, y: at[1], z: at[2] + 0.5 } };
      assert.equal(name, 'go_to');
      walks.push(args.pos);
      at = walks.length === 1 ? drift === 'side' ? side : second : args.pos;
      return { arrived: true, position: at };
    };
    await assert.rejects(earnIronKit(action, () => assert.fail('No ore to smelt'), { bed: [-20, 64, 0] }, {
      resumeQuarry: stairs,
      resumeQuarryLanding: landing,
      reenterQuarry: true,
      checkCompanion: async () => { throw reachedIronSearch; },
      saveQuarry: async (route, at) => saves.push([[...route], at]),
    }), error => error === reachedIronSearch);
    assert.deepEqual(walks, wet ? [first] : drift === 'side' ? [first, first, second, landing] : [first, landing]);
    assert.deepEqual(saves, wet ? [[[], undefined]] : [[stairs, landing]]);
  }
});

test('the iron kit brings carried ore home before smelting it', async () => {
  const { earnIronKit } = await import('./expedition-home.mjs');
  const home = new Error('Recorded raw iron at camp');
  const actions = [];
  const action = async name => {
    actions.push(name);
    assert.equal(name, 'get_inventory');
    return { slots: [{ id: 'minecraft:raw_iron', count: 1 }] };
  };
  await assert.rejects(earnIronKit(action, async () => assert.fail('Smelted before reaching camp'), { bed: [0, 1, 0] }, {
    bringFirstIronHome: async () => { throw home; },
  }), error => error === home);
  assert.deepEqual(actions, ['get_inventory', 'get_inventory']);
});

test('the first earned ingot funds a shield before scouting for the rest of the kit', async () => {
  const { earnIronKit } = await import('./expedition-home.mjs');
  const slots = [
    { id: 'minecraft:iron_ingot', count: 1, slot: 0 },
    { id: 'minecraft:oak_planks', count: 10, slot: 1 },
  ];
  const block = 'minecraft:crafting_table';
  const shield = 'minecraft:shield';
  const crafted = [];
  const nextScoutingPass = new Error('The controller resumed scouting');
  const action = async (name, args) => {
    switch (name) {
      case 'get_inventory': return { slots };
      case 'observe':
        return { inWorld: true, onGround: true, health: 20, food: 20, position: { x: 0.5, y: 1, z: 0.5 } };
      case 'get_blocks':
        if (args.size[0] === 11) return { cells: [cell(0, 0, 0), cell(2, 0, 0)] };
        assert.deepEqual(crafted, [block, shield]);
        throw nextScoutingPass;
      case 'select_slot': return { mainHand: slots.find(item => item.slot === args.slot) };
      case 'place_block': return { placed: true, blockAtPos: block };
      case 'interact_block': return { screenOpened: 'CraftingScreen' };
      case 'get_container':
        return { slots: slots.map(stack => ({ ...stack, section: 'player' })) };
      case 'click_slot':
        assert.deepEqual(args, { slot: slots.find(stack => stack.id === shield).slot, action: 'swap', hotbar: 40 });
        slots.find(stack => stack.id === shield).slot = args.hotbar;
        return {};
      case 'stop': return {};
      default: assert.fail(`Unexpected action: ${name}`);
    }
  };
  const craft = async (item, amount) => {
    crafted.push(item);
    assert.equal(amount, 1);
    if (item === shield) slots.find(stack => stack.id === 'minecraft:iron_ingot').count--;
    slots.push({ id: item, count: amount, slot: slots.length });
  };
  await assert.rejects(earnIronKit(action, craft, { bed: [0, 1, 0] }), error => error === nextScoutingPass);
  assert.equal(slots.find(stack => stack.id === shield)?.slot, 40);
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

test('an overland bearing crosses a slope without climbing the nearby canopy', async () => {
  const { dryWaypoint } = await import('./expedition-navigation.mjs');
  const terrain = [
    cell(0, 0, 0), cell(1, 0, 0), cell(2, 1, 0, 'oak_leaves'), cell(3, 1, 0, 'oak_leaves'),
    cell(3, 2, 0), cell(0, 1, 1), cell(1, 2, 1), cell(2, 3, 1), cell(3, 3, 1),
  ];
  assert.deepEqual(dryWaypoint(terrain, [0, 1, 0], [], [3, 1, 0], 'surface'), [0, 2, 1]);
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
  const { dryWaypoint, exitObstruction } = await import('./expedition-navigation.mjs');
  const blocks = [
    cell(0, 0, 0), cell(1, 0, 0), cell(1, 1, 0, 'oak_leaves'), cell(1, 2, 0, 'oak_leaves'),
    cell(0, 0, 1, 'water'), cell(0, 2, 1, 'birch_leaves'),
  ];
  assert.equal(dryWaypoint(blocks, [0, 1, 0], [], [1, 1, 0]), null);
  assert.deepEqual(exitObstruction(blocks, [0, 1, 0]), [1, 1, 0]);
  assert.deepEqual(exitObstruction(blocks.filter(block => block.y !== 1), [0, 1, 0]), [1, 2, 0]);
});

test('a crafting table can be packed when it blocks a dry step toward camp', async () => {
  const { exitObstruction } = await import('./expedition-navigation.mjs');
  const here = [0, 1, 0];
  const table = [1, 2, 0];
  const blocks = [cell(0, 0, 0), cell(1, 1, 0, 'stone'), cell(...table, 'crafting_table')];
  assert.equal(exitObstruction(blocks, here), null);
  assert.equal(exitObstruction(blocks, here, [-5, 2, 0]), null);
  assert.deepEqual(exitObstruction(blocks, here, [5, 2, 0]), table);
});

test('starter crafting finds a higher terrace and clears the plant above its support', async () => {
  const { placeBeside } = await import('./expedition-home.mjs');
  const table = 'minecraft:crafting_table';
  const position = { x: 1.09, y: 118, z: 8.11 };
  const spot = [2, 119, 6];
  const cleared = [];
  const action = async (name, args) => {
    switch (name) {
      case 'get_inventory': return { slots: [{ id: table, slot: 1, count: 1 }] };
      case 'select_slot': return { mainHand: { id: table } };
      case 'observe': return { position };
      case 'get_blocks': return { cells: [
        cell(1, 117, 8), cell(1, 117, 7), cell(2, 118, 6), cell(...spot, 'wildflowers'),
      ] };
      case 'break_block':
        cleared.push(args.pos);
        return { broken: true };
      case 'place_block':
        assert.deepEqual(args.pos, spot);
        assert.deepEqual(cleared, [spot]);
        return { placed: true, blockAtPos: table };
      default: assert.fail(name);
    }
  };
  assert.deepEqual(await placeBeside(action, table), spot);
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

test('a visible log in the same trunk can supply the missing bed planks', async () => {
  const { ensurePlanks } = await import('./expedition-home.mjs');
  const aimed = [270, 102, -212];
  const actual = [270, 101, -212];
  const position = { x: 270.9, y: 100, z: -213.3 };
  const broken = [];
  let stock = [{ id: 'minecraft:oak_planks', count: 2 }];
  const action = async (name, args) => {
    switch (name) {
      case 'get_inventory': return { slots: stock };
      case 'observe': return { position, crosshair: { pos: actual, block: 'minecraft:oak_log' } };
      case 'scan_blocks': return { matches: [{ name: 'minecraft:oak_log', positions: [aimed] }] };
      case 'go_to':
        if (args.entityId) stock.push({ id: 'minecraft:oak_log', count: 1 });
        return { arrived: true };
      case 'look': assert.deepEqual(args.at, aimed); return {};
      case 'break_block': broken.push(args.pos); return { broken: true };
      case 'get_entities': return { entities: [{ id: 100, item: { id: 'minecraft:oak_log' } }] };
      default: assert.fail(name);
    }
  };
  await ensurePlanks(action, async (item, count) => { stock = [{ id: item, count: count + 2 }]; }, 3);
  assert.deepEqual(broken, [actual]);
  assert.deepEqual(stock, [{ id: 'minecraft:oak_planks', count: 6 }]);
});

test('an exhausted highland scout prefers a supported descent to open plateau ground', async () => {
  const { dryWaypoint } = await import('./expedition-navigation.mjs');
  const cells = [{ x: 0, y: 98, z: 0, b: 'minecraft:stone' }];
  for (let index = 1; index <= 6; index++) {
    cells.push({ x: index, y: 98, z: 0, b: 'minecraft:stone' });
    cells.push({ x: -index, y: 98 - index, z: 0, b: 'minecraft:stone' });
  }
  cells.push({ x: 0, y: 93, z: 1, b: 'minecraft:stone' });
  assert.deepEqual(dryWaypoint(cells, [0, 99, 0], [], undefined, 'downhill'), [-6, 93, 0]);
});
