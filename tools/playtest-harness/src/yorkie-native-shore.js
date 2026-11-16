'use strict';

const assert = require('node:assert/strict');
const { driveClientInput } = require('./client-input');
const { assertInspectionWorld } = require('./yorkie-post-run');
const { assertVehicleMount, assertVehicleReach, vehicleTools } = require('./yorkie-vehicle-fixture');
const { advanceWorldTicks } = require('./yorkie-clock');
const { WALK_TICKS, SETTLE_TICKS, buildShoreBank, assertOwnerInShore, assertShoreBoardingGrace, assertShoreEndpoint, assertStableShore } = require('./yorkie-native-shore-fixture');

function nativeShoreInputs() {
  const rows = [];
  for (const time of [1000, 18000]) for (const hunger of [0, 90]) for (const sitting of [false, true]) {
    rows.push({ time, hunger, sitting, ownerMode: 'survival', flying: false, shelter: 'outside' });
  }
  return rows;
}

function nativeShoreCases(context) {
  const { prepare, command, request, state, entity, base, player, expectedSave, playerUuid } = context;
  const identity = { expectedSave, playerUuid };
  const { nativeItems } = vehicleTools(context);
  return nativeShoreInputs().map(inputs => ({
    name: `native-shore-${inputs.time}-${inputs.hunger}-${inputs.sitting ? 'sit' : 'follow'}`,
    inputs, inspectionPet: false, stopOnFailure: true,
    setup: async () => {
      assertInspectionWorld(await state(), identity);
      await prepare(inputs);
      await command('tick freeze');
      const pet = entity(await state());
      const harness = await request('/use-entity', { type: pet.type, radius: 8, item: 'mushroom_yorkie:yorkie_harness', count: 1 });
      assert(harness.target.custom.harness, 'Native shore fixture did not equip its harness');
      await command(`item replace entity ${pet.uuid} weapon.mainhand with minecraft:amethyst_shard[minecraft:custom_name='"Shore keepsake"'] 2`);
      const bank = await buildShoreBank(context);
      await command(`summon minecraft:oak_boat ${base.x + 0.5} ${base.y - 0.48} ${base.z + 0.5} {Tags:["matrix_vehicle"]}`);
      const boat = (await state()).players[0].nearbyEntities.find(e => e.type === 'minecraft:oak_boat');
      assert(boat, 'Native shore source boat is missing');
      await command(`ride ${player} mount ${boat.uuid}`);
      await command(`ride ${pet.uuid} mount ${boat.uuid}`);
      await command('tick unfreeze');
      await new Promise(resolve => setTimeout(resolve, 400));
      const before = await state();
      assertInspectionWorld(before, identity);
      const mounted = assertVehicleMount(before, pet.uuid, boat.uuid);
      assert(before.players[0].vehicle?.id === boat.id, 'Original owner is not driving the source boat');
      assert(mounted.health === mounted.maxHealth && mounted.tameable.orderedToSit === inputs.sitting
        && !mounted.inWater && !mounted.noGravity, 'Invalid starting shore passenger state');
      const equipment = await nativeItems(pet.uuid, 'equipment');
      assert(JSON.stringify(equipment).includes('Shore keepsake'), 'Named shore possession was not established');
      return { before, bank, petUuid: pet.uuid, boatUuid: boat.uuid, equipment,
        staging: 'native ride commands only before observation; normal AI, collision, gravity and damage' };
    },
    run: async (fixture, result, save) => {
      const observed = result.observed = { fixture, trace: [], sawWet: false };
      function inspect(snapshot, stage) {
        observed.trace.push({ stage, snapshot });save();
        assertInspectionWorld(snapshot, identity);
        const owner = snapshot.players[0], pet = entity(snapshot);
        assert(pet?.uuid === fixture.petUuid && pet.tameable.ownedByPlayer, 'Original owned shore pet is missing');
        assert(pet.health === pet.maxHealth && pet.custom.harness && !pet.noGravity, 'Shore pet lost health, harness or ordinary gravity');
        assert(Number.isFinite(pet.air) && Number.isFinite(pet.fallDistance) && typeof pet.inWater === 'boolean'
          && typeof pet.lastDamageType === 'string', 'Shore pet is missing native air/fall/damage evidence');
        assert(owner.health === fixture.before.players[0].health, 'Shore owner lost health');
        assert(owner.nearbyEntities.some(e => e.uuid === fixture.boatUuid), 'Original shore boat is missing');
        observed.sawWet ||= pet.inWater;
        if (observed.restAnchor) assertShoreBoardingGrace(snapshot, pet, { boatUuid: fixture.boatUuid, helpGameTime: observed.helpGameTime });
        if (inputs.sitting && !observed.sawWet && observed.restAnchor) {
          assert(Math.hypot(...['x', 'y', 'z'].map(k => pet.position[k] - observed.restAnchor[k])) <= 1,
            'Dry sitting pet drifted more than one block after owner help');
        }
        assertOwnerInShore(snapshot, fixture.bank.geometry);
        return pet;
      }
      const drive = async (name, controls) => {
        try {
          observed[name] = await driveClientInput({ ...context, ...identity }, controls, {
            onReceipt: partial => {
              observed[name] = partial;
              const snapshot = partial.receipts.at(-1).serverSnapshot;
              assert(snapshot, 'Native shore input receipt is missing its server snapshot');
              inspect(snapshot, name);
              save();
            }
          });
        } catch (error) {
          observed[name] = error.observed;
          const last = error.observed?.cleanup || error.observed?.receipts?.at(-1);
          observed.inputRelease = { stage: name, attempted: !!error.observed,
            confirmed: !error.observed || !error.observed.cleanupError && last?.phase === 'complete' && last?.controlsReleased === true,
            outcome: last?.outcome, cleanupError: error.observed?.cleanupError };
          if (!observed.inputRelease.confirmed) error.message += `; native control release unconfirmed: ${observed.inputRelease.cleanupError || 'no terminal release proof'}`;
          save();throw error;
        }
        return inspect(observed[name].after, `${name}-after`);
      };
      inspect(fixture.before, 'before');
      await drive('exit', { mode: 'dismount', ticks: 2, vehicleUuid: fixture.boatUuid });
      await command('tick freeze');
      const frozenExit = await state();assert(frozenExit.worldFrozen, 'Owner help requires a frozen world');
      const passenger = inspect(frozenExit, 'exit-frozen');
      assertVehicleReach(passenger, 'survival');
      observed.help = await request('/use-entity', { type: passenger.type, radius: 3, emptyHand: true });save();
      assert(observed.help.target.uuid === fixture.petUuid, 'Shore help targeted another pet');
      const helpState = await state();
      assert(helpState.worldFrozen, 'Owner help observation lost its frozen boundary');
      const helped = inspect(helpState, 'help-after-frozen');
      assert(!helped.vehicle, 'Ordinary owner help did not dismount Mushroom');
      observed.restAnchor = { ...helped.position };observed.helpGameTime = helpState.overworldGameTime;save();
      const firstHelpTick = await advanceWorldTicks(command, state, 1, 'step');
      assert(firstHelpTick.worldFrozen && firstHelpTick.tickAudit.elapsedTicks === 1, 'Help observation skipped a native tick');
      inspect(firstHelpTick, 'help-first-native-tick');
      await command('tick unfreeze');
      inspect(await state(), 'walk-resumed');
      await drive('walk', { mode: 'walk', ticks: WALK_TICKS, forward: true });
      await command('tick freeze');
      observed.afterWalkFrozen = await state();inspect(observed.afterWalkFrozen, 'walk-frozen');
      const blockBelow = actor => request('/block', { x: Math.floor(actor.position.x), y: Math.floor(actor.position.y - 0.01), z: Math.floor(actor.position.z) });
      observed.ownerFootBlock = await blockBelow(observed.afterWalkFrozen.players[0]);save();
      assert(observed.ownerFootBlock.block === 'minecraft:grass_block', 'Owner did not walk onto dry bank support');
      let final;
      for (let tick = 1; tick <= SETTLE_TICKS; tick++) {
        final = await advanceWorldTicks(command, state, 1, 'step');
        inspect(final, `settle-${tick}`);
        assert(final.worldFrozen && final.tickAudit.elapsedTicks === 1, 'Shore observer skipped native world ticks');
      }
      const pet = entity(final);
      observed.petFootBlock = await blockBelow(pet);
      observed.ownerFootBlockAtEnd = await blockBelow(final.players[0]);
      observed.equipmentAfter = await nativeItems(fixture.petUuid, 'equipment');save();
      assert.deepEqual(observed.equipmentAfter, fixture.equipment);
      observed.endpoint = assertShoreEndpoint({ pet, owner: final.players[0], footBlock: observed.petFootBlock,
        ownerFootBlock: observed.ownerFootBlockAtEnd, initialSit: inputs.sitting, sawWet: observed.sawWet,
        snapshot: final, geometry: fixture.bank.geometry, boatUuid: fixture.boatUuid, restAnchor: observed.restAnchor });
      observed.stability = assertStableShore(observed.trace.filter(f => f.stage.startsWith('settle-')).slice(-40).map(f => f.snapshot),
        { petUuid: fixture.petUuid, initialSit: inputs.sitting, sawWet: observed.sawWet,
          geometry: fixture.bank.geometry, boatUuid: fixture.boatUuid, restAnchor: observed.restAnchor });
      return observed;
    },
    cleanup: async result => {
      assertInspectionWorld(await state(), identity);
      await command(result.status === 'passed' ? 'tick unfreeze' : 'tick freeze');
      const snapshot = await state();assertInspectionWorld(snapshot, identity);
      assert(snapshot.worldFrozen === (result.status !== 'passed'), 'Shore cleanup did not establish the requested world tick state');
    }
  }));
}

module.exports = { nativeShoreInputs, nativeShoreCases };
