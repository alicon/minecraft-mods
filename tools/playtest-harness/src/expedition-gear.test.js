const assert = require('node:assert/strict');
const test = require('node:test');

const mat = 'mushroom_yorkie:camp_mat';
const stock = (...items) => ({ slots: items.map(([id, count]) => ({ id, count })) });

test('companion gear counts wool across colors and uses ink as a source of black dye', async () => {
  const { COMPANION_WEARABLES: [harness, vest], gearNeeds } = await import('./expedition-gear.mjs');
  const materials = stock(['minecraft:leather', 3], ['minecraft:string', 5],
    ['minecraft:white_wool', 1], ['minecraft:black_wool', 2], ['minecraft:red_wool', 1], ['minecraft:ink_sac', 1]);
  assert.deepEqual(gearNeeds(materials), {
    missing: [harness, vest, mat], leather: 0, string: 0, wool: 0, dye: true, ink: false,
  });
});

test('reattaching with an equipped harness and a packed vest only needs supplies for the mat', async () => {
  const { COMPANION_WEARABLES: [harness, vest], gearNeeds } = await import('./expedition-gear.mjs');
  const inventory = stock([vest, 1], ['minecraft:string', 2], ['minecraft:white_wool', 1], ['minecraft:white_carpet', 5]);
  assert.deepEqual(gearNeeds(inventory, [harness]), {
    missing: [mat], leather: 0, string: 0, wool: 1, dye: false, ink: false,
  });
});
