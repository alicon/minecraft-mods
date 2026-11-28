const assert = require('node:assert/strict');
const test = require('node:test');

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
