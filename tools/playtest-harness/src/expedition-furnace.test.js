const assert = require('node:assert/strict');
const test = require('node:test');

test('the player can earn charcoal from a log and one plank through the native furnace menu', async () => {
  const { makeExpeditionCharcoal } = await import('./expedition-furnace.mjs');
  const clicks = [];
  let reads = 0;
  let result;
  await makeExpeditionCharcoal(async (name, args) => {
    if (name === 'click_slot') clicks.push(args);
    if (name === 'transfer_items') {
      result = args;
      return { moved: 1 };
    }
    if (name === 'get_container') return {
      type: 'minecraft:furnace',
      containerId: 3,
      slots: reads++ === 0 ? [
        { id: 'minecraft:oak_log', section: 'player', slot: 9, count: 1 },
        { id: 'minecraft:oak_planks', section: 'player', slot: 10, count: 8 },
      ] : [{ id: 'minecraft:charcoal', section: 'result', count: 1 }],
    };
  });
  assert.deepEqual(clicks.filter(click => click.action === 'right').map(click => click.slot), [0, 1]);
  assert.deepEqual(result, { to: 'player', item: 'minecraft:charcoal', count: 1 });
});

test('the iron stage credits ingots taken from the native output slot', async () => {
  const { smeltExpeditionIron } = await import('./expedition-furnace.mjs');
  const raw = 'minecraft:raw_iron';
  const coal = 'minecraft:coal';
  const ingot = 'minecraft:iron_ingot';
  const calls = [];
  let reads = 0;
  let taken = false;
  await smeltExpeditionIron(async (name, args) => {
    calls.push([name, args]);
    switch (name) {
      case 'get_container':
        return {
          containerId: 7, type: 'minecraft:furnace',
          slots: reads++ === 0 ? [] : [{ section: 'result', id: ingot, count: 7 }],
        };
      case 'get_inventory':
        return { slots: [{ id: ingot, count: taken ? 9 : 2 }] };
      case 'transfer_items':
        if (args.to === 'player') taken = true;
        return { moved: args.count };
      default:
        throw new Error(`Unexpected test action ${name}`);
    }
  }, 7);
  assert.deepEqual(calls.filter(([name]) => name === 'transfer_items'), [
    ['transfer_items', { to: 'container', item: raw, count: 7 }],
    ['transfer_items', { to: 'container', item: coal, count: 1 }],
    ['transfer_items', { to: 'player', item: ingot, count: 7 }],
  ]);
});

test('a stale output or failed transfer cannot count as earned iron', async () => {
  const { smeltExpeditionIron } = await import('./expedition-furnace.mjs');
  let reads = 0;
  await assert.rejects(smeltExpeditionIron(async (name, args) => {
    if (name === 'get_inventory') return { slots: [{ id: 'minecraft:iron_ingot', count: 2 }] };
    if (name === 'transfer_items') return { moved: args.to === 'player' ? 0 : args.count };
    return {
      containerId: 7, type: 'minecraft:furnace',
      slots: reads++ === 0 ? [] : [{ section: 'result', id: 'minecraft:iron_ingot', count: 7 }],
    };
  }, 7), /did not take the smelted ingots/);
});
