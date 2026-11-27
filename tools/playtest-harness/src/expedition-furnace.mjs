import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';

const INGOT = 'minecraft:iron_ingot';
const RAW_IRON = 'minecraft:raw_iron';
const COAL = 'minecraft:coal';

export async function cookExpeditionMutton(action) {
  const menu = await action('get_container');
  assert.equal(menu?.type, 'minecraft:furnace');
  const meat = menu.slots.find(stack => stack.section === 'player' && stack.id === 'minecraft:mutton' && stack.count >= 3);
  const fuel = menu.slots.find(stack => stack.section === 'player' && stack.id.endsWith('_planks') && stack.count >= 2);
  if (!meat || !fuel || menu.slots.some(stack => stack.section !== 'player')) return;
  for (const [stack, slot] of [[meat, 0], [fuel, 1]]) {
    await action('click_slot', { slot: stack.slot, action: 'left' });
    await action('click_slot', { slot, action: 'right' });
    await action('click_slot', { slot, action: 'right' });
    await action('click_slot', { slot: stack.slot, action: 'left' });
  }
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

export async function smeltExpeditionIron(action, needed) {
  const furnace = await action('get_container');
  assert.equal(furnace?.type, 'minecraft:furnace', 'The native furnace menu must be open');
  assert.ok(furnace.slots.every(slot => slot.section === 'player'), 'Expected the expedition furnace to be empty');
  const initial = await action('get_inventory');
  const before = initial.slots.filter(stack => stack.id === INGOT).reduce((sum, stack) => sum + stack.count, 0);
  const ore = await action('transfer_items', { to: 'container', item: RAW_IRON, count: needed });
  assert.ok(ore?.moved >= needed, 'Raw iron did not move into the native furnace');
  const coal = await action('transfer_items', { to: 'container', item: COAL, count: Math.ceil(needed / 8) });
  assert.ok(coal?.moved >= Math.ceil(needed / 8), 'Coal did not move into the fuel slot');

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
