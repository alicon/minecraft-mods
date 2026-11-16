'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { craftingInputs, craftingCases } = require('./yorkie-crafting');

test('crafting checks cover all mod outputs, vanilla fallbacks and rejected inputs', () => {
  const rows = craftingInputs();
  assert.equal(rows.length, 15);
  assert.equal(new Set(rows.map(row => row.name)).size, 15);
  assert.equal(rows.filter(row => row.expected?.startsWith('mushroom_yorkie:')).length, 9);
  assert.equal(rows.filter(row => row.expected?.startsWith('minecraft:')).length, 3);
  for (const row of rows.filter(row => !row.error)) assert.equal(row.body.slots.length, row.body.width * row.body.height);
});

test('a vanilla fallback and ambiguous mod result fail the crafting verdict', async () => {
  const run = response => craftingCases({ query: async () => response })[0].run(null, {});
  await assert.rejects(run({ ok: true, mode: 'read_only_recipe_resolution', matched: true, result: { id: 'minecraft:copper_nugget', count: 9 }, matchingRecipes: ['vanilla', 'mod'] }), /Expected/);
  await assert.rejects(run({ ok: true, mode: 'read_only_recipe_resolution', matched: true, result: { id: 'mushroom_yorkie:dog_bowl', count: 1 }, matchingRecipes: ['first', 'second'] }), /Ambiguous/);
});

test('an error case cannot pass on an unrelated server failure', async () => {
  const invalid = craftingCases({ query: async () => ({ ok: false, error: 'unrelated failure' }) }).find(row => row.inputs.error);
  await assert.rejects(invalid.run(null, {}), /not rejected/);
});
