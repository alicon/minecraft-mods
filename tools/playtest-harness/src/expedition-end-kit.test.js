const assert = require('node:assert/strict');
const test = require('node:test');

const stack = (item, count = 1, damage, maxDamage) => ({ id: `minecraft:${item}`, count, damage, maxDamage });

test('the End kit accounts for crafting batches, damaged weapons and room for a furnace', async () => {
  const { endKitNeeds } = await import('./expedition-end-kit.mjs');
  const needs = endKitNeeds({ slots: [
    stack('bow', 1, 325, 384), stack('iron_sword', 1, 225, 250), stack('arrow', 9),
    stack('water_bucket'), stack('bucket'), stack('feather', 1), stack('string', 2),
    stack('flint', 1), stack('stick', 2), stack('cobblestone', 32), stack('cooked_beef', 2), stack('mutton', 5),
  ] }, 96, 4);
  assert.deepEqual(needs, {
    bow: true, sword: true, batches: 22, food: 2, rawFood: 5, flint: 21,
    feathers: 21, string: 1, sticks: 24, water: 1, blocks: 10,
  });
});

test('multiple carried ammo and ration stacks satisfy the End kit without recrafting', async () => {
  const { endKitNeeds } = await import('./expedition-end-kit.mjs');
  const needs = endKitNeeds({ slots: [
    stack('bow', 1, 2, 384), stack('stone_sword', 1, 1, 131),
    stack('arrow', 64), stack('arrow', 32), stack('water_bucket'), stack('water_bucket'),
    stack('cooked_chicken', 10), stack('bread', 6), stack('cobblestone', 32),
  ] });
  assert.deepEqual(needs, {
    bow: false, sword: false, batches: 0, food: 0, rawFood: 0, flint: 0,
    feathers: 0, string: 0, sticks: 0, water: 0, blocks: 0,
  });
});
