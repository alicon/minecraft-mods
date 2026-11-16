'use strict';

// Exact mounted survival interactions, shared by stationary and moving fixtures.
async function exerciseMountedCare({ request, state, entity, command, player, advance, check }, fixture, before, observed, inspectMounted) {
  observed.feed = await request('/use-entity', { type: before.type, radius: 8, item: 'minecraft:apple', count: 2 });
  const fed = await inspectMounted(await state(), 'fed-mounted');
  check(fed.vehicle?.id === fixture.vehicleId, 'Mounted feeding unexpectedly dismounted Mushroom');
  check(fed.custom.needs.hunger === Math.max(0, before.custom.needs.hunger - 32), 'Mounted apple applied an unexpected food change');
  const held = await command(`data get entity ${player} SelectedItem.count`);
  check(held.result === 1, 'Mounted feeding did not consume exactly one survival apple');
  // Empty-hand dismount has priority; using a harness item explicitly toggles it.
  await request('/use-entity', { type: before.type, radius: 8, item: 'mushroom_yorkie:yorkie_harness', count: 1 });
  const removed = entity(await state());
  observed.harnessRemoved = removed;
  check(!removed.custom.harness && removed.vehicle?.id === fixture.vehicleId, 'Mounted harness removal failed or dismounted the pet');
  const removedCount = await command(`clear ${player} mushroom_yorkie:yorkie_harness 0`);
  check(removedCount.result === 2, 'Harness removal did not retain the spare and return exactly one worn harness');
  await request('/use-entity', { type: before.type, radius: 8 });
  const restored = await inspectMounted(await state(), 'harness-restored-mounted');
  check(restored.vehicle?.id === fixture.vehicleId, 'Mounted harness equip dismounted Mushroom');
  const restoredCount = await command(`clear ${player} mushroom_yorkie:yorkie_harness 0`);
  check(restoredCount.result === 1, 'Mounted harness equip did not consume exactly one survival harness');
  // A completed care case deliberately leaves a passenger for post-run inspection.
  await command('tick unfreeze');
  const settled = await inspectMounted(await advance(40), 'mounted-full-ticks');
  check(settled.vehicle?.id === fixture.vehicleId && !settled.noGravity, 'Grounded owner did not retain a normal passenger');
}

module.exports = { exerciseMountedCare };
