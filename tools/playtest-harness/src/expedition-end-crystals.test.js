const assert = require('node:assert/strict');
const test = require('node:test');

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
  const arrow = { distance: 12, pos: [12.5, 61, 0.5] };
  const action = async (name, args) => {
    if (name === 'observe') return { inWorld: true, health: 20, dimension: 'minecraft:the_end', onGround: true,
      position: { x: 0.5, y: 60, z: 0.5 } };
    if (name === 'get_entities') {
      const entities = {
        'mushroom_yorkie:mushroom_yorkie': [dog],
        'minecraft:end_crystal': [crystal],
        'minecraft:dragon_fireball': [arrow],
      };
      return { entities: entities[args.type] ?? [] };
    }
    if (name === 'get_blocks') {
      return { cells: Array.from({ length: 9 }, (_, x) => ({ x: -x, y: 59, z: 0, b: 'minecraft:end_stone' })) };
    }
    if (name === 'go_to') {
      assert.ok(args.pos[0] < 0);
      throw escape;
    }
    assert.fail(`Unexpected action before retreat: ${name}`);
  };
  await assert.rejects(clearGeneratedCrystals(action, dog.uuid, () => assert.fail('No crystal should be fired at')),
    error => error === escape);
});
