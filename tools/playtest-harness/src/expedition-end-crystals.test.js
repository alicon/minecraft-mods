const assert = require('node:assert/strict');
const test = require('node:test');

test('a cage approach uses a dry column outside the spike and a clear adjacent descent', async () => {
  const { cageApproach } = await import('./expedition-end-cage.mjs');
  const crystal = { pos: [0.5, 85, 0.5] };
  const player = { position: { x: 8.5, y: 64, z: 0.5 } };
  const cells = [-1, 0, 1].map(offset => ({ x: 2, y: 85 + offset, z: 0, b: 'minecraft:iron_bars' }));
  for (let x = 4; x <= 7; x++) cells.push({ x, y: 63, z: 0, b: 'minecraft:end_stone' });
  cells.push({ x: 4, y: 71, z: 0, b: 'minecraft:obsidian' });
  cells.push({ x: 7, y: 69, z: 0, b: 'minecraft:obsidian' });
  const plan = cageApproach(cells, crystal, player);
  assert.deepEqual(plan.base, [5, 64, 0]);
  assert.equal(plan.top, 84);
  assert.deepEqual([plan.dx, plan.dz], [1, 0]);
  assert.equal(plan.bars.length, 9);
  assert.deepEqual(plan.bars.filter(([, , z]) => z === 0), [[2, 84, 0], [2, 85, 0], [2, 86, 0]]);
});

test('a full draw crosses the target height between flight ticks', async () => {
  const { bowAim } = await import('./expedition-ballistics.mjs');
  const player = { position: { x: 0.5, y: 60, z: 0.5 } };
  const target = [42.5, 87, 0.5];
  const aim = bowAim(player, target);
  const radians = -aim.pitch * Math.PI / 180;
  const horizontal = 3 * Math.cos(radians);
  const vertical = 3 * Math.sin(radians);
  const travel = (target[0] - player.position.x) / horizontal;
  const ticks = Math.log(1 - 0.01 * travel) / Math.log(0.99);
  const y = player.position.y + 1.52 + vertical * travel - 0.05 * (ticks - travel) / 0.01;
  assert.ok(Math.abs(y - target[1]) < 0.01, `arrow crossed at y=${y}`);
});

test('the archer can reject an arc that crosses a nearer spike', async () => {
  const { clearBowArc } = await import('./expedition-ballistics.mjs');
  const player = { position: { x: 19.5, y: 58, z: 39.5 } };
  const crystal = [-12.5, 84, 39.5];
  const pillar = ([x, y, z]) => x >= 10 && x <= 15 && y < 77 && z >= 37 && z <= 41;
  assert.equal(clearBowArc(player, crystal, pillar), false);
  assert.equal(clearBowArc({ position: { ...player.position, z: 48.5 } }, crystal, pillar), true);
});

test('an overhead shot can reach the exposed crystal above a tall obsidian spike', async () => {
  const { bowAim, clearBowArc } = await import('./expedition-ballistics.mjs');
  const player = { position: { x: 52.5, y: 59, z: 26.5 } };
  const target = [33.5, 96, 24.5];
  const spike = ([x, y, z]) => Math.hypot(x - 33, z - 24) <= 3 && y <= 94;
  const high = bowAim(player, target, 'high');
  assert.equal(clearBowArc(player, target, spike), false);
  assert.ok(high.pitch < bowAim(player, target).pitch);
  assert.equal(clearBowArc(player, target, spike, high), true);
});

test('the End archer leaves crystals within blast range of the original dog intact', async () => {
  const { shootEndCrystal } = await import('./expedition-end-crystals.mjs');
  const player = { dimension: 'minecraft:the_end', position: { x: 0, y: 65, z: 0 }, onGround: true, health: 20 };
  const dog = { uuid: 'original', health: 12, pos: [20, 70, 0] };
  const crystal = { uuid: 'crystal-by-dog', distance: 23, pos: [22, 72, 0] };
  const action = async (name, args) => {
    if (name === 'observe') return player;
    if (name === 'get_entities' && args.type === 'mushroom_yorkie:mushroom_yorkie') return { entities: [dog] };
    if (name === 'get_entities' && args.type === 'minecraft:end_crystal') return { entities: [crystal] };
    assert.fail(`Unexpected action: ${name}`);
  };
  assert.equal(await shootEndCrystal(action, dog.uuid), null);
});

test('the crystal run takes a dry route away from an incoming dragon fireball before shooting', async () => {
  const { clearGeneratedCrystals } = await import('./expedition-end-crystals.mjs');
  const escape = new Error('Observed a retreat along dry ground');
  const dog = { uuid: 'original', health: 12, pos: [0, 60, 8] };
  const crystal = { uuid: 'distant-crystal', pos: [24, 80, 0] };
  const fireball = { distance: 29.91, pos: [30.41, 60, 0.5] };
  const changes = [];
  let autoDefend = true;
  const action = async (name, args) => {
    if (name === 'observe') return { inWorld: true, health: 20, dimension: 'minecraft:the_end', onGround: true,
      position: { x: 0.5, y: 60, z: 0.5 } };
    if (name === 'get_entities') {
      if (args.type === 'minecraft:dragon_fireball') {
        return { entities: args.radius >= fireball.distance ? [fireball] : [] };
      }
      const entities = {
        'mushroom_yorkie:mushroom_yorkie': [dog],
        'minecraft:end_crystal': [crystal],
      };
      return { entities: entities[args.type] ?? [] };
    }
    if (name === 'get_blocks') {
      return { cells: Array.from({ length: 9 }, (_, x) => ({ x: -x, y: 59, z: 0, b: 'minecraft:end_stone' })) };
    }
    if (name === 'set_reflexes') {
      if (args && 'autoDefend' in args) autoDefend = args.autoDefend;
      if (args && 'interruptOnDamage' in args) changes.push(args.interruptOnDamage);
      return { interruptOnDamage: changes.at(-1) ?? true };
    }
    if (name === 'go_to') {
      assert.ok(args.pos[0] < 0);
      assert.equal(autoDefend, false, 'Nearby passive Endermen must not trigger bridge melee');
      assert.deepEqual(changes, [false]);
      throw escape;
    }
    assert.fail(`Unexpected action before retreat: ${name}`);
  };
  await assert.rejects(clearGeneratedCrystals(action, dog.uuid, () => assert.fail('No crystal should be fired at')),
    error => error === escape);
  assert.deepEqual(changes, [false, true]);
});

test('an Enderman hit interrupts crystal work until the player is protected by water', async () => {
  const { clearGeneratedCrystals } = await import('./expedition-end-crystals.mjs');
  const bucket = { id: 'minecraft:water_bucket', slot: 3, count: 1 };
  const apple = { id: 'minecraft:golden_apple', slot: 4, count: 1 };
  const dog = { uuid: 'original', health: 12, pos: [0, 60, 8] };
  const crystal = { uuid: 'distant-crystal', pos: [24, 80, 0] };
  const safe = new Error('Reached the recovery meal');
  const used = [];
  let mainHand;
  let observations = 0;
  const action = async (name, args) => {
    switch (name) {
      case 'set_reflexes': return {};
      case 'get_entities':
        return { entities: ({
          'mushroom_yorkie:mushroom_yorkie': [dog], 'minecraft:end_crystal': [crystal],
        })[args.type] ?? [] };
      case 'observe':
        return {
          inWorld: true, dimension: 'minecraft:the_end', position: { x: 0.5, y: 60, z: 0.5 }, gameTime: 100,
          health: observations++ === 0 ? 20 : 13,
          onGround: observations > 1, inWater: used.includes(bucket.id),
          threats: [{ id: 816, type: 'minecraft:enderman', distance: 2 }],
        };
      case 'get_inventory': return { slots: [bucket, apple] };
      case 'select_slot':
        mainHand = [bucket, apple].find(item => item.slot === args.slot);
        return { mainHand };
      case 'look': return {};
      case 'use_item':
        used.push(mainHand.id);
        if (mainHand === apple) {
          assert.deepEqual(used, [bucket.id, apple.id]);
          throw safe;
        }
        return { success: true };
      default: assert.fail(`Unexpected action: ${name}`);
    }
  };
  await assert.rejects(clearGeneratedCrystals(action, dog.uuid, () => assert.fail('No crystal work while being hit')),
    error => error === safe);
});

test('the End archer eats a carried meal when too hungry to recover for a cage climb', async () => {
  const { clearGeneratedCrystals } = await import('./expedition-end-crystals.mjs');
  const dog = { uuid: 'original', health: 12, pos: [0, 60, 8] };
  const meal = { id: 'minecraft:cooked_beef', slot: 4, count: 1 };
  const recovered = new Error('Took the ordinary meal before scouting again');
  const action = async (name, args) => {
    switch (name) {
      case 'set_reflexes': return {};
      case 'get_entities':
        return { entities: ({
          'mushroom_yorkie:mushroom_yorkie': [dog], 'minecraft:end_crystal': [{ uuid: 'tower', pos: [24, 80, 0] }],
        })[args.type] ?? [] };
      case 'observe': return { inWorld: true, onGround: true, dimension: 'minecraft:the_end',
        position: { x: 0.5, y: 60, z: 0.5 }, health: 14, food: 15, gameTime: 100 };
      case 'get_inventory': return { slots: [meal] };
      case 'look': return {};
      case 'select_slot': assert.equal(args.slot, meal.slot); return { mainHand: meal };
      case 'use_item': throw recovered;
      default: assert.fail(`Unexpected action: ${name}`);
    }
  };
  await assert.rejects(clearGeneratedCrystals(action, dog.uuid, () => assert.fail('No crystal work before eating')),
    error => error === recovered);
});

test('a vanished crystal needs two observations of its nearby loaded spike', async () => {
  const { observeMissingCrystal, readCrystalProgress } = await import('./expedition-end-crystals.mjs');
  const crystal = { uuid: 'incidental', pos: [8.5, 95, 0.5] };
  const anchored = [8, 94, 0];
  const sample = { position: { x: 0.5, y: 60, z: 0.5 }, gameTime: 100 };
  const evidence = new Map();
  let unloaded = true;
  const action = async (name, args) => {
    assert.equal(name, 'get_blocks');
    assert.deepEqual(args.center, anchored);
    return { stats: { unloadedChunks: unloaded ? 1 : 0 }, cells: [{ b: 'minecraft:bedrock' }] };
  };
  assert.equal(await observeMissingCrystal(action, sample, crystal, evidence), false);
  unloaded = false;
  assert.equal(await observeMissingCrystal(action, sample, crystal, evidence), false);
  assert.equal(await observeMissingCrystal(action, { ...sample, gameTime: 114 }, crystal, evidence), false);
  assert.equal(await observeMissingCrystal(action, { ...sample, gameTime: 125 }, crystal, evidence), true);
  const rows = [
    { action: 'observe', observation: { ...sample, dimension: 'minecraft:the_end' } },
    { action: 'get_entities', args: { type: 'minecraft:end_crystal' }, observation: { entities: [crystal] } },
    { action: 'generated_crystal_absence', crystal: crystal.uuid },
  ];
  assert.deepEqual(readCrystalProgress(rows.map(row => JSON.stringify(row)).join('\n') + '\n{unfinished'),
    { seen: [crystal], broken: [crystal.uuid], started: 100 });
});

test('a crystal pillar descent checks the full water column and steers against surface drift', async () => {
  const { descendCrystalPillar } = await import('./expedition-end-cage.mjs');
  const plan = { base: [39, 61, -25], dx: 1, dz: 0 };
  const from = { inWorld: true, health: 18, position: { x: 39.46, y: 79, z: -24.5 } };
  const observations = [
    { ...from, position: { x: 39.82, y: 79, z: -24.5 }, inWater: true, onGround: true },
    { ...from, position: { x: 40.86, y: 78, z: -24.5 }, inWater: true, onGround: false },
    { ...from, position: { x: 40.53, y: 70, z: -24.5 }, inWater: true, onGround: false },
    { ...from, position: { x: 40.52, y: 61, z: -24.5 }, inWater: true, onGround: false },
    { ...from, position: { x: 41.52, y: 62, z: -24.5 }, inWater: true, onGround: false },
    { ...from, position: { x: 42.5, y: 61, z: -24.5 }, inWater: false, onGround: true },
  ];
  const moves = [];
  let scannedColumn = false;
  const action = async (name, args) => {
    switch (name) {
      case 'get_inventory': return { selectedSlot: 0, slots: [{ id: 'minecraft:water_bucket', count: 1, slot: 0 }] };
      case 'select_slot': return { mainHand: { id: 'minecraft:water_bucket' } };
      case 'look': assert.equal(args.pitch, 90); return {};
      case 'use_item': return { success: true };
      case 'get_blocks':
        if (args.size[0] === 1) {
          assert.deepEqual(args.size, [1, 19, 1]);
          scannedColumn = true;
          return { cells: Array.from({ length: 19 }, (_, i) =>
            ({ x: 40, y: 61 + i, z: -25, b: 'minecraft:water' })) };
        }
        return { cells: [40, 41, 42].map(x => ({ x, y: 59, z: -25, b: 'minecraft:end_stone' })) };
      case 'move': moves.push(args); return { completed: true };
      case 'observe': return observations.shift();
      case 'go_to': return { arrived: true };
      default: assert.fail(`Unexpected action: ${name}`);
    }
  };
  assert.equal(await descendCrystalPillar(action, from, plan, [42, 61, -25]), true);
  assert.ok(scannedColumn);
  assert.equal(observations.length, 0);
  assert.equal(moves[0].yaw, -90);
  assert.equal(moves[1].sneak, false, 'Sneak must release while stepping off the solid rim');
  assert.equal(moves[2].yaw, 90);
  assert.equal(moves[2].sneak, true);
  assert.equal(moves[3].forward, undefined);
  assert.equal(moves[3].sneak, true);
  assert.deepEqual(moves[4], { sneak: true, ticks: 5 });
});

test('a displaced climber pours below only when solid ground comes within reach', async () => {
  const { catchEndFall } = await import('./expedition-end-cage.mjs');
  const bucket = { id: 'minecraft:water_bucket', slot: 3, count: 1 };
  const airborne = { inWorld: true, health: 18, onGround: false, inWater: false };
  const observations = [
    { ...airborne, crosshair: { type: 'miss' } },
    { ...airborne, crosshair: { type: 'block', block: 'minecraft:obsidian', face: 'east' } },
    { ...airborne, crosshair: { type: 'block', block: 'minecraft:end_stone', face: 'up' } },
    { ...airborne, inWater: true },
  ];
  let pours = 0;
  const action = async (name, args) => {
    switch (name) {
      case 'look': assert.deepEqual(args, { pitch: 90 }); return {};
      case 'get_inventory': return { slots: [bucket] };
      case 'select_slot': assert.equal(args.slot, bucket.slot); return { mainHand: bucket };
      case 'observe': return observations.shift();
      case 'use_item':
        assert.equal(observations.length, 1);
        pours++;
        return { success: true };
      default: assert.fail(`Unexpected action: ${name}`);
    }
  };
  assert.equal(await catchEndFall(action, airborne), true);
  assert.equal(pours, 1);
  assert.equal(observations.length, 0);
});

test('landing on the client one tick before a lethal server hit is not a recovery', async () => {
  const { catchEndFall } = await import('./expedition-end-cage.mjs');
  const bucket = { id: 'minecraft:water_bucket', slot: 4 };
  const airborne = { inWorld: true, health: 20, onGround: false, inWater: false };
  const observations = [{ ...airborne, onGround: true }, { ...airborne, dead: true, health: 0 }];
  const action = async name => {
    if (name === 'look') return {};
    if (name === 'get_inventory') return { slots: [bucket] };
    if (name === 'select_slot') return { mainHand: bucket };
    if (name === 'observe') return observations.shift();
    assert.fail(name);
  };
  assert.equal(await catchEndFall(action, airborne), false);
});

test('a cleared cage can be shot from an alternate dry stance using current block observations', async () => {
  const { surveyedCrystalShot } = await import('./expedition-end-crystals.mjs');
  const player = { inWorld: true, onGround: true, position: { x: -18.5, y: 57, z: 70.5 } };
  const crystal = { uuid: 'guarded', pos: [-12.5, 83, 39.5] };
  let blocks = [];
  const action = async (name, args) => {
    assert.equal(name, 'get_blocks');
    assert.equal(args.format, 'json');
    assert.ok(args.size[2] > 30);
    return { cells: blocks, stats: { unloadedChunks: 0 } };
  };
  const available = await surveyedCrystalShot(action, player, crystal, [1, 1.5], new Set());
  assert.ok(available?.aim);
  const next = await surveyedCrystalShot(action, player, crystal, [1, 1.5], new Set([available.key]));
  assert.ok(next?.aim);
  assert.notEqual(next.key, available.key);
  blocks = Array.from({ length: 32 }, (_, index) => 57 + index).flatMap(y =>
    [-18, -17, -16].map(x => ({ x, y, z: 63, b: 'minecraft:obsidian' })));
  assert.equal(await surveyedCrystalShot(action, player, crystal, [1, 1.5], new Set()), null);
});

test('the archer removes only his own pillar and stops on the original ground', async () => {
  const { dismantleCrystalPillar } = await import('./expedition-end-cage.mjs');
  const material = 'minecraft:cobblestone';
  const base = [-7, 56, 39];
  const state = y => ({ inWorld: true, onGround: true, health: 20, position: { x: -6.5, y, z: 39.5 } });
  const pickaxe = { id: 'minecraft:diamond_pickaxe', slot: 2 };
  let height = 59;
  let held = material;
  const removed = [];
  const action = async (name, args) => {
    switch (name) {
      case 'get_inventory': return { slots: [pickaxe] };
      case 'select_slot': assert.equal(args.slot, pickaxe.slot); held = pickaxe.id; return { mainHand: pickaxe };
      case 'get_blocks':
        return { cells: [args.center[1] - 1, args.center[1]].map(y =>
          ({ x: -7, y, z: 39, b: y === 55 ? 'minecraft:end_stone' : material })) };
      case 'look': assert.equal(args.pitch, 90); return {};
      case 'observe': return state(height);
      case 'break_block':
        assert.equal(held, pickaxe.id, 'use the pickaxe even when the climb stopped before opening the cage');
        assert.deepEqual(args.pos, [-7, height - 1, 39]);
        removed.push(height - 1);
        height--;
        return { broken: true, block: material };
      default: assert.fail(`Unexpected action: ${name}`);
    }
  };
  assert.equal(await dismantleCrystalPillar(action, state(height), base, material, pickaxe.id), true);
  assert.deepEqual(removed, [58, 57, 56]);
  assert.equal(height, 56);
  assert.equal(await dismantleCrystalPillar(action, state(58), [-8, 56, 39], material), false);
});
