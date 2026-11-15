'use strict';

const { terrainCases } = require('./yorkie-terrain');

// Reuse the guarded below-ledge fixture to test losing owner flight at two fetch phases.
function flightTransitionCases(context) {
  const { command, request, advance, entity, base, player, check } = context;
  return terrainCases(context).filter((row) => row.inputs.flying && row.inputs.layout === 'cliff')
    .flatMap((row) => ['chase', 'carrying'].map((phase) => ({
      ...row, name: `fetch-land-${phase}-${row.inputs.item.split(':')[1]}`,
      inputs: { ...row.inputs, landingPhase: phase },
      run: async (fixture, result) => {
        result.observed = { fixture, trace: [] };
        const original = entity(fixture);
        let elapsedTicks = 0;
        async function observe(ticks, stage) {
          const snapshot = await advance(ticks);
          elapsedTicks += ticks;
          const pet = entity(snapshot);
          const inventory = (await request('/command', { command: `clear ${player} ${row.inputs.item} 0` }, true)).result;
          const ground = snapshot.players[0].nearbyEntities
            .filter((e) => e.type === 'minecraft:item' && e.item?.id === row.inputs.item)
            .reduce((n, e) => n + e.item.count, 0);
          const held = pet?.mainHand?.id === row.inputs.item ? pet.mainHand.count : 0;
          result.observed.trace.push({ stage, ticks: elapsedTicks, advancedTicks: ticks, inventory, ground, held, pet });
          check(pet?.uuid === original.uuid, 'Landing fetch carrier disappeared or left the observation area');
          check(pet.health >= original.health, 'Landing fetch damaged Mushroom');
          check(inventory + ground + held === 1, 'Landing fetch lost or duplicated the toy');
          return { snapshot, pet, inventory, held };
        }
        await command('tick unfreeze');
        let observed = await observe(1, 'before-landing');
        if (phase === 'carrying') {
          for (let ticks = 1; ticks < 300 && !observed.held; ticks += 5) {
            observed = await observe(5, 'before-landing');
          }
        }
        if (phase === 'chase') {
          // A single tick can precede goal startup. Require actual movement away from
          // the owner toward this fixture's toy, not ordinary owner-follow flight.
          for (let ticks = 1; ticks < 100 && observed.pet.position.x <= original.position.x + 0.25 && !observed.held; ticks++) {
            observed = await observe(1, 'before-landing');
          }
        }
        const ready = phase === 'carrying' ? observed.held === 1
          : observed.held === 0 && observed.inventory === 0 && observed.pet.position.x > original.position.x + 0.25;
        if (!ready) {
          const error = new Error('Could not observe the requested fetch phase before landing');
          error.phase = 'setup';
          throw error;
        }
        result.observed.beforeLanding = observed.snapshot;
        await request('/player-abilities', { player, flying: false, mayfly: true });
        await command(`tp ${player} ${base.x - 2.5} ${base.y} ${base.z + 0.5}`);
        for (let ticks = 20; ticks <= 800; ticks += 20) {
          observed = await observe(20, 'landed');
          if (observed.inventory === 1) break;
        }
        check(observed.inventory === 1 && !observed.held, 'Landed owner never received the toy');
        const settled = await observe(40, 'settled');
        result.observed.settled = settled.snapshot;
        check(settled.inventory === 1 && !settled.held && !settled.pet.noGravity,
          'Completed fetch did not settle safely after landing');
        check(settled.pet.custom.needs.mood >= 74 && settled.pet.custom.needs.mood < 88,
          'Landing fetch missed or repeated its play reward');
        return result.observed;
      }
    })));
}

module.exports = { flightTransitionCases };
