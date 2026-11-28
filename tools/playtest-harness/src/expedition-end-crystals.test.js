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
  assert.deepEqual(plan.bars, [[2, 84, 0], [2, 85, 0], [2, 86, 0]]);
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
  const changes = [];
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
    if (name === 'set_reflexes') {
      if (args && 'interruptOnDamage' in args) changes.push(args.interruptOnDamage);
      return { interruptOnDamage: changes.at(-1) ?? true };
    }
    if (name === 'go_to') {
      assert.ok(args.pos[0] < 0);
      assert.deepEqual(changes, [false]);
      throw escape;
    }
    assert.fail(`Unexpected action before retreat: ${name}`);
  };
  await assert.rejects(clearGeneratedCrystals(action, dog.uuid, () => assert.fail('No crystal should be fired at')),
    error => error === escape);
  assert.deepEqual(changes, [false, true]);
});
