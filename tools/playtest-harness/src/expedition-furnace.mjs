import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';

const INGOT = 'minecraft:iron_ingot';
const RAW_IRON = 'minecraft:raw_iron';
const COAL = 'minecraft:coal';
const CHARCOAL = 'minecraft:charcoal';

async function putInSlot(action, stack, slot, amount) {
  await action('click_slot', { slot: stack.slot, action: 'left' });
  for (let placed = 0; placed < amount; placed++) await action('click_slot', { slot, action: 'right' });
  await action('click_slot', { slot: stack.slot, action: 'left' });
}

export async function cookExpeditionMutton(action) {
  const menu = await action('get_container');
  assert.equal(menu?.type, 'minecraft:furnace');
  const meat = menu.slots.find(stack => stack.section === 'player' && stack.id === 'minecraft:mutton' && stack.count >= 3);
  const fuel = menu.slots.find(stack => stack.section === 'player' && stack.id.endsWith('_planks') && stack.count >= 2);
  if (!meat || !fuel || menu.slots.some(stack => stack.section !== 'player')) return;
  await putInSlot(action, meat, 0, 2);
  await putInSlot(action, fuel, 1, 2);
  for (let poll = 0; poll < 36; poll++) {
    const current = await action('get_container');
    if (current?.containerId !== menu.containerId) break;
    if (current.slots.some(stack => stack.section === 'result' && stack.id === 'minecraft:cooked_mutton' && stack.count >= 2)) break;
    await setTimeout(650);
  }
  await action('transfer_items', { to: 'player', item: 'minecraft:cooked_mutton' });
  await action('transfer_items', { to: 'player', item: meat.id });
  await action('transfer_items', { to: 'player', item: fuel.id });
}

export async function makeExpeditionCharcoal(action) {
  const furnace = await action('get_container');
  assert.equal(furnace?.type, 'minecraft:furnace');
  assert.ok(furnace.slots.every(slot => slot.section === 'player'), 'Expected the expedition furnace to be empty');
  const log = furnace.slots.find(stack => stack.id.endsWith('_log'));
  const fuel = furnace.slots.find(stack => stack.id.endsWith('_planks'));
  assert.ok(log && fuel, 'Need a log and planks to make charcoal');
  await putInSlot(action, log, 0, 1);
  await putInSlot(action, fuel, 1, 1);
  for (let poll = 0; poll < 36; poll++) {
    const current = await action('get_container');
    assert.equal(current?.containerId, furnace.containerId, 'Furnace closed before making charcoal');
    if (current.slots.some(stack => stack.section === 'result' && stack.id === CHARCOAL)) {
      const moved = await action('transfer_items', { to: 'player', item: CHARCOAL, count: 1 });
      assert.ok(moved?.moved >= 1, 'The player did not collect the earned charcoal');
      return;
    }
    await setTimeout(650);
  }
  throw new Error('The native furnace did not finish making charcoal');
}

export async function smeltExpeditionIron(action, needed, fuel = COAL) {
  const furnace = await action('get_container');
  assert.equal(furnace?.type, 'minecraft:furnace', 'The native furnace menu must be open');
  assert.ok(furnace.slots.every(slot => slot.section === 'player'), 'Expected the expedition furnace to be empty');
  const initial = await action('get_inventory');
  const before = initial.slots.filter(stack => stack.id === INGOT).reduce((sum, stack) => sum + stack.count, 0);
  const ore = await action('transfer_items', { to: 'container', item: RAW_IRON, count: needed });
  assert.ok(ore?.moved >= needed, 'Raw iron did not move into the native furnace');
  const addedFuel = await action('transfer_items', { to: 'container', item: fuel, count: Math.ceil(needed / 8) });
  assert.ok(addedFuel?.moved >= Math.ceil(needed / 8), 'Fuel did not move into the furnace slot');

  // The bridge follows the actual game clock. Allow slower ticks without
  // skipping time or simulating a result in the controller.
  for (let poll = 0; poll < needed * 35; poll++) {
    const current = await action('get_container');
    assert.equal(current?.containerId, furnace.containerId, 'The furnace closed before smelting completed');
    if (current.slots.some(stack => stack.section === 'result' && stack.id === INGOT && stack.count >= needed)) {
      await action('transfer_items', { to: 'player', item: INGOT, count: needed });
      const inventory = await action('get_inventory');
      const after = inventory.slots.filter(stack => stack.id === INGOT).reduce((sum, stack) => sum + stack.count, 0);
      assert.ok(after >= before + needed, 'The player did not take the smelted ingots');
      return;
    }
    await setTimeout(800);
  }
  throw new Error('The native furnace did not finish smelting the expedition iron');
}
