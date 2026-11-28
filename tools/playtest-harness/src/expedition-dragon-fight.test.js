const assert = require('node:assert/strict');
const test = require('node:test');

test('the native exit fountain is identified by its bedrock column and rim', async () => {
  const { findEndFountain } = await import('./expedition-dragon-fight.mjs');
  const rim = [-1, 0, 1].flatMap(x => [-1, 0, 1].filter(z => x || z).map(z => [x, 63, z]));
  assert.deepEqual(findEndFountain([[45, 89, 0], [0, 65, 0], ...rim, [0, 63, 0], [0, 64, 0]]), [0, 63, 0]);
  assert.equal(findEndFountain([[45, 89, 0], ...rim]), null);
});

test('a perched dragon strike uses the native head on the crosshair at full cooldown', async () => {
  const { strikePerchedDragon } = await import('./expedition-dragon-fight.mjs');
  const sword = 'minecraft:diamond_sword';
  const player = { position: { x: 0.5, y: 65, z: 0.5 }, mainHand: { id: sword }, attackStrength: 1 };
  const dragon = { perched: true, parts: [{ id: 342, name: 'head', inReach: true, center: [0.5, 66.62, 3.5] }] };
  const strikes = [];
  let crosshair = { type: 'entity', id: 343 };
  let cooldown = 1;
  const action = async (name, args) => {
    if (name === 'look') {
      assert.ok(Number.isFinite(args.yaw) && Number.isFinite(args.pitch));
      return args;
    }
    if (name === 'observe') return { ...player, onGround: true, crosshair, attackStrength: cooldown };
    if (name === 'attack_entity') {
      strikes.push(args.entityId);
      return { attackStrength: 1 };
    }
    assert.fail(name);
  };
  assert.equal(await strikePerchedDragon(action, player, { ...dragon, perched: false }, sword), null);
  assert.equal(await strikePerchedDragon(action, player, dragon, sword), null);
  crosshair = { type: 'entity', id: 342 };
  cooldown = 0.4;
  assert.equal(await strikePerchedDragon(action, player, dragon, sword), null);
  cooldown = 1;
  assert.equal((await strikePerchedDragon(action, player, dragon, sword)).attackStrength, 1);
  assert.deepEqual(strikes, [342]);
});

test('a visible edge can expose the head when the neck blocks a center strike', async () => {
  const { strikePerchedDragon } = await import('./expedition-dragon-fight.mjs');
  const sword = 'minecraft:diamond_sword';
  const player = { position: { x: 5.54, y: 61, z: 8.2 }, mainHand: { id: sword }, attackStrength: 1 };
  const dragon = { perched: true, parts: [{ id: 326, name: 'head', inReach: true, center: [3.59, 63.61, 5.65] }] };
  let looks = 0;
  const action = async (name, args) => {
    if (name === 'look') return ++looks;
    if (name === 'observe') return { ...player, onGround: true, crosshair: { type: 'entity', id: looks > 1 ? 326 : 327 } };
    if (name === 'attack_entity') {
      assert.equal(args.entityId, 326);
      return { attackStrength: 1 };
    }
    assert.fail(name);
  };
  assert.ok(await strikePerchedDragon(action, player, dragon, sword));
  assert.equal(looks, 2);
});

test('a still-visible breath cloud blocks a walk back in from safe ground', async () => {
  const { breathBlocksWalk } = await import('./expedition-dragon-fight.mjs');
  const player = { position: { x: -13.67, y: 61, z: -0.48 } };
  const cloud = { pos: [-7.17, 61, 4.42] };
  assert.equal(breathBlocksWalk(player, [-7, 61, -1], [cloud]), true);
  assert.equal(breathBlocksWalk(player, [-14, 61, -8], [cloud]), false);
  assert.equal(breathBlocksWalk(player, [-7, 61, -1], [{ pos: [-7.17, 82, 4.42] }]), false);
});

test('a bow shot leads a moving dragon through the remaining draw and arrow flight', async () => {
  const { bowAim, movingBowAim } = await import('./expedition-ballistics.mjs');
  const player = { position: { x: 0, y: 60, z: 0 } };
  const previous = { pos: [0, 70, 30], tick: 96 };
  const current = { pos: [4, 70, 30], tick: 100 };
  const stationary = bowAim(player, current.pos);
  const prompt = movingBowAim(player, previous, current, 2);
  const delayed = movingBowAim(player, previous, current, 10);
  assert.ok(prompt.aim.yaw < stationary.yaw);
  assert.ok(delayed.aim.yaw < prompt.aim.yaw);
  assert.ok(delayed.flightTicks > prompt.flightTicks);
  assert.equal(movingBowAim(player, previous, { ...current, tick: 112 }, 2), null);
});

test('flying dragon aim leads the exposed head and falls back to the body when turned away', async () => {
  const { leadDragonShot } = await import('./expedition-dragon-fight.mjs');
  const player = { position: { x: 0, y: 60, z: 0 } };
  const frame = (tick, x, headZ) => ({ tick, dragon: { parts: [
    { name: 'head', center: [x, 68, headZ] },
    { name: 'body', center: [x, 69, 28] },
  ] } });
  const head = leadDragonShot(player, frame(100, -2, 21), frame(104, 0, 21), 5);
  const body = leadDragonShot(player, frame(100, -2, 35), frame(104, 0, 35), 5);
  assert.equal(head.part, 'head');
  assert.equal(body.part, 'body');
  assert.ok(head.flightTicks < body.flightTicks);
  assert.equal(leadDragonShot(player, frame(90, -2, 21), frame(104, 0, 21), 5), null);
});

test('a low incoming dragon sweep calls for a sidestep toward the island', async () => {
  const { dragonSweepDodge } = await import('./expedition-dragon-fight.mjs');
  const player = { position: { x: -18.5, y: 59, z: 31.63 } };
  const fountain = [0, 59, 0];
  const frame = (tick, center, perched = false) => ({ tick,
    dragon: { uuid: 'original', perched, parts: [{ name: 'head', id: 27, center }] } });
  const prev = frame(17_958, [-1.12, 64.05, 16.94]);
  const danger = frame(17_979, [-10.71, 63.64, 26.02]);
  const dodge = dragonSweepDodge(player, prev, danger, fountain);
  assert.ok(dodge.ticks < 18);
  assert.ok(Math.hypot(dodge.target[0], dodge.target[2]) < Math.hypot(-18.5, 31.63));
  assert.equal(dragonSweepDodge(player, prev, frame(17_979, [-10.71, 63.64, 26.02], true), fountain), null);
  assert.equal(dragonSweepDodge(player, danger, frame(17_991, [-2, 63, 19]), fountain), null);
  assert.equal(dragonSweepDodge(player, frame(17_958, [-1.12, 78.05, 16.94]),
    frame(17_979, [-10.71, 77.64, 26.02]), fountain), null);
});

test('a real Enderman hit interrupts the duel for a water refuge', async () => {
  const { fightEndDragon } = await import('./expedition-dragon-fight.mjs');
  const sword = { id: 'minecraft:diamond_sword', slot: 0 };
  const bucket = { id: 'minecraft:water_bucket', slot: 4 };
  const position = { x: -15.25, y: 61, z: -8.11 };
  const player = { inWorld: true, dimension: 'minecraft:the_end', onGround: true,
    position, health: 20, food: 20, gameTime: 18_798 };
  const rim = [-1, 0, 1].flatMap(x => [-1, 0, 1].filter(z => x || z).map(z => [x, 59, z]));
  const protectedByWater = new Error('Water was confirmed before moving or attacking');
  let observations = 0;
  let poured = false;
  const action = async (name, args) => {
    if (name === 'observe') {
      if (observations++ === 0) return player;
      return { ...player, health: 15.3, inWater: poured,
        events: ['took 1.9 damage from minecraft:enderman #1100, health 15.3/20'],
        threats: [{ id: 1100, type: 'minecraft:enderman', distance: 1.6 }] };
    }
    if (name === 'get_inventory') return { slots: [sword, bucket] };
    if (name === 'scan_blocks') return { matches: [{ name: 'minecraft:bedrock',
      positions: [[0, 59, 0], [0, 60, 0], [0, 61, 0], ...rim] }] };
    if (name === 'get_entities') return { entities: [] };
    if (name === 'select_slot') { assert.equal(args.slot, bucket.slot); return { mainHand: bucket }; }
    if (name === 'look') { assert.equal(args.pitch, 90); return {}; }
    if (name === 'use_item') { poured = true; return { success: true }; }
    assert.fail(name);
  };
  await assert.rejects(fightEndDragon(action, (kind, evidence) => {
    if (kind === 'enderman_refuge') {
      assert.ok(poured);
      assert.equal(evidence.attacker, 1100);
      throw protectedByWater;
    }
  }), error => error === protectedByWater);
});

test('a dragon launch keeps checking until a water landing is in reach', async () => {
  const { fightEndDragon } = await import('./expedition-dragon-fight.mjs');
  const state = { inWorld: true, dimension: 'minecraft:the_end', onGround: true,
    health: 20, food: 20, position: { x: 7.2, y: 61, z: 16.5 } };
  const bucket = { id: 'minecraft:water_bucket', slot: 4 };
  const sword = { id: 'minecraft:diamond_sword', slot: 1 };
  const rim = [-1, 0, 1].flatMap(x => [-1, 0, 1].filter(z => x || z).map(z => [x, 59, z]));
  let observations = 0;
  let poured = false;
  const events = [];
  const action = async (name, args) => {
    switch (name) {
      case 'observe': {
        observations++;
        if (observations === 1) return state;
        if (observations < 60) return { ...state, onGround: false,
          position: { ...state.position, y: observations < 10 ? 154 : 100 } };
        if (observations === 60) return { ...state, onGround: false,
          crosshair: { type: 'block', block: 'minecraft:end_stone', face: 'up' } };
        return { ...state, inWater: poured, health: poured ? 20 : 0 };
      }
      case 'look': assert.equal(args.pitch, 90); return {};
      case 'get_inventory': return { slots: [sword, bucket] };
      case 'select_slot': assert.equal(args.slot, bucket.slot); return { mainHand: bucket };
      case 'use_item': assert.equal(observations, 60); poured = true; return { success: true };
      case 'get_entities': return { entities: [] };
      case 'scan_blocks':
        return { matches: args.blocks[0] === 'bedrock'
          ? [{ name: 'minecraft:bedrock', positions: [[0, 59, 0], [0, 60, 0], [0, 61, 0], ...rim] }]
          : [{ name: 'minecraft:end_portal', positions: [[0, 59, 1]] }] };
      default: assert.fail(`Unexpected action: ${name}`);
    }
  };
  await fightEndDragon(action, (event, detail) => events.push({ event, ...detail }), { dragon: 'original', hits: 1 });
  assert.ok(poured);
  assert.deepEqual(events.map(event => event.event), ['fountain', 'fall_recovery', 'victory']);
  assert.equal(events[1].landed, true);
});

test('the reserve bucket stays available when carried food uses the working hotbar slot', async () => {
  const { keepLandingBucketOnHotbar } = await import('./expedition-dragon-fight.mjs');
  const bucket = { id: 'minecraft:water_bucket', slot: 10 };
  const stock = { selectedSlot: 4, slots: [...Array.from({ length: 9 }, (_, slot) =>
    ({ id: slot === 3 ? 'minecraft:bucket' : 'minecraft:end_stone', slot })), bucket] };
  const actions = [];
  const action = async (name, args) => {
    if (name === 'select_slot') {
      actions.push(args.slot);
      stock.selectedSlot = args.slot;
      return { mainHand: { id: actions.length === 2 ? bucket.id : 'minecraft:end_stone' } };
    }
    if (name === 'get_inventory') return { ...stock };
    if (name === 'get_container') return { slots: [{ section: 'player', invSlot: 10, slot: 10 }] };
    if (name === 'click_slot') {
      assert.deepEqual(args, { slot: 10, action: 'swap', hotbar: 3 });
      return {};
    }
    assert.fail(name);
  };
  await keepLandingBucketOnHotbar(action, { ...stock });
  assert.deepEqual(actions, [3, 3, 4]);
});

test('End water search prioritizes reachable sources and skips rejected positions', async () => {
  const { chooseEndWater } = await import('./expedition-dragon-fight.mjs');
  const player = { position: { x: -14.5, y: 62, z: 0.5 } };
  const fountain = [0, 59, 0];
  const nearby = [-16, 62, 0];
  const elevated = [-16, 67, 0];
  const insideRim = [-9, 62, 0];
  const farther = [-28, 63, 0];
  const scan = { waterSourcesOnly: true, matches: [{ name: 'minecraft:water', positions: [farther, elevated, insideRim, nearby] }] };
  assert.deepEqual(chooseEndWater(scan, player, fountain, new Set()), nearby);
  assert.deepEqual(chooseEndWater(scan, player, fountain, new Set([String(nearby)])), farther);
  assert.deepEqual(chooseEndWater({ ...scan, waterSourcesOnly: undefined }, player, fountain, new Set()), farther);
});

test('a blocked perch approach lets the player stage on a safe flank', async () => {
  const { breathBlocksWalk, perchApproach } = await import('./expedition-dragon-fight.mjs');
  const player = { position: { x: 22.557, y: 58, z: -7.5 } };
  const head = { center: [1.68, 63.39, -5.13] };
  const fountain = [0, 59, 0];
  const clouds = [{ pos: [2.06, 60, -0.52] }];
  assert.deepEqual(perchApproach(player, head, fountain, []), { target: [1, 61, -7], waiting: false });
  const flank = perchApproach(player, head, fountain, clouds);
  assert.ok(flank.waiting && flank.target);
  assert.equal(breathBlocksWalk(player, flank.target, clouds), false);
  const [x, y, z] = flank.target;
  const staged = { position: { x: x + 0.5, y, z: z + 0.5 } };
  assert.deepEqual(perchApproach(staged, head, fountain, clouds), { target: null, waiting: true });
});
