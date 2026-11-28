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
