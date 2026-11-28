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
    const dog = { id: 22, uuid: 'original', distance: 2, pos: [2, 64, 0] };
    const decoy = { ...dog, id: 19, uuid: 'other' };
    const action = async (name, args) => {
      switch (name) {
        case 'observe': return { position: { x: 0, y: 64, z: 0 }, crosshair: { id: hit } };
        case 'get_entities': return { entities: [decoy, dog] };
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
    assert.equal(await feedAdoptedDog(action, dog.uuid, [0, 64, 0], 1), hit === dog.id);
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
        return {};
      default:
        assert.fail(`Unexpected action: ${name}`);
    }
  };
  assert.equal(await feedAdoptedDog(action, 'original', [0, 64, 0], 9), true);
  assert.equal(meals, 0);
});

test('a feeding attempt walks away from a zombie before offering the meal', async () => {
  const { feedAdoptedDog } = await import('./expedition-home.mjs');
  const threat = { id: 12, type: 'minecraft:zombie_villager', pos: [1.5, 1, 0.5], distance: 1, hostile: true };
  const dog = { id: 22, uuid: 'original', pos: [-7.5, 1, 0.5], distance: 1 };
  let retreated = false;
  let meals = 1;
  const action = async (name, args) => {
    switch (name) {
      case 'observe':
        return { inWorld: true, health: 12, position: { x: retreated ? -8.5 : 0.5, y: 1, z: 0.5 },
          threats: retreated ? [] : [threat], crosshair: { id: dog.id } };
      case 'get_inventory':
        return { mainHand: { id: 'minecraft:mutton' }, slots: [{ id: 'minecraft:mutton', count: meals }] };
      case 'get_entities':
        return { entities: args.type === threat.type ? [threat] : [dog] };
      case 'get_blocks':
        return { cells: Array.from({ length: 10 }, (_, x) => cell(-x, 0, 0)) };
      case 'go_to':
        assert.ok(args.pos[0] < 0);
        retreated = true;
        return { arrived: true, position: [-8.5, 1, 0.5] };
      case 'look':
        return {};
      case 'interact_entity':
        assert.ok(retreated);
        assert.equal(args.entityId, dog.id);
        meals--;
        return {};
      default:
        assert.fail(`Unexpected action: ${name}`);
    }
  };
  assert.equal(await feedAdoptedDog(action, dog.uuid, [0, 1, 0], 2), true);
  assert.equal(meals, 0);
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

test('iron work returns to camp after feeding the injured companion before spending another portion', async () => {
  const { earnIronKit } = await import('./expedition-home.mjs');
  const checkedAt = [];
  let caredFor = false;
  let x = 0;
  let gameTime = 0;
  const atCamp = new Error('The companion was checked again at camp');
  const action = async (name, args) => {
    switch (name) {
      case 'get_inventory': return { slots: [] };
      case 'observe':
        gameTime += 50;
        return { inWorld: true, position: { x: x + 0.5, y: 1, z: 0.5 }, health: 20, food: 20, gameTime };
      case 'get_blocks':
        assert.ok(caredFor);
        return { cells: Array.from({ length: 9 }, (_, tile) => cell(tile, 0, 0)) };
      case 'go_to':
        assert.equal(args.pos[0], 8);
        x = args.pos[0];
        return { arrived: true, position: args.pos };
      default: assert.fail(`Unexpected action: ${name}`);
    }
  };
  const policy = {
    companionNeedsCare: async () => {
      checkedAt.push(x);
      if (checkedAt.length > 1) throw atCamp;
      return true;
    },
    tendCompanion: async () => {
      assert.equal(x, 0);
      caredFor = true;
    },
  };
  await assert.rejects(earnIronKit(action, () => assert.fail('No recipe has ingredients'), {
    bed: [8, 1, 0],
  }, policy), error => error === atCamp);
  assert.deepEqual(checkedAt, [0, 8]);
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
