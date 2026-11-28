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
      assert.ok(Math.abs(args.yaw) < 0.1 && Math.abs(args.pitch) < 0.1);
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

test('a still-visible breath cloud blocks a walk back in from safe ground', async () => {
  const { breathBlocksWalk } = await import('./expedition-dragon-fight.mjs');
  const player = { position: { x: -13.67, y: 61, z: -0.48 } };
  const cloud = { pos: [-7.17, 61, 4.42] };
  assert.equal(breathBlocksWalk(player, [-7, 61, -1], [cloud]), true);
  assert.equal(breathBlocksWalk(player, [-14, 61, -8], [cloud]), false);
  assert.equal(breathBlocksWalk(player, [-7, 61, -1], [{ pos: [-7.17, 82, 4.42] }]), false);
});
