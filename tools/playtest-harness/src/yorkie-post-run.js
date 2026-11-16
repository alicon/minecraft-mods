'use strict';

const assert = require('node:assert/strict');
const { saveReport } = require('./scenario-runner');
const { assertTestWorld } = require('./yorkie-world');
const TYPE = 'mushroom_yorkie:mushroom_yorkie';

function assertInspectionWorld(snapshot, { expectedSave, playerUuid }) {
  assertTestWorld(snapshot, expectedSave);
  assert(snapshot.players[0].dimension.includes('minecraft:overworld'), 'Inspection requires the original Overworld');
  assert.equal(snapshot.players[0].uuid, playerUuid, 'Inspection player changed');
}

async function careForSuccessfulPet(context) {
  const { state, request, petUuid, fixtureTag = 'matrix_yorkie' } = context;
  const observed = {};
  try {
    assert.match(petUuid || '', /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i, 'Missing original fixture UUID');
    assert(['matrix_yorkie', 'runtime_smoke_yorkie'].includes(fixtureTag), 'Unsupported care fixture tag');
    const petIn = (snapshot) => snapshot.players[0].nearbyEntities.find((e) => e.type === TYPE && e.uuid === petUuid);
    observed.before = await state();
    assertInspectionWorld(observed.before, context);
    const original = petIn(observed.before);
    assert(original?.health > 0 && original.tameable?.ownedByPlayer, 'Original live owned pet is not observable; refusing replacement');
    assert(Number.isFinite(original.maxHealth) && original.maxHealth > 0 && original.maxHealth <= 1024, 'Invalid pet maximum health');
    const read = (command) => request('/command', { command }, true);
    const tagged = await read(`execute as ${petUuid} if entity @s[type=${TYPE},tag=${fixtureTag}]`);
    assert.equal(tagged.success, true, 'Original pet is not a tagged test fixture');
    async function equipment() {
      const fields = {};
      for (const field of ['equipment', 'HandItems']) {
        const reply = await read(`data get entity ${petUuid} ${field}`);
        assert(!reply.feedbackTruncated, 'Cannot verify truncated equipment');
        if (reply.success === false) {
          // Empty equipment is omitted on modern saves. Prove absence natively instead of interpreting an error string.
          const absent = await read(`execute unless data entity ${petUuid} ${field}`);
          assert(absent.success === true && absent.result === 1, 'Cannot verify missing equipment field');
          fields[field] = null;
        } else {
          assert(reply.success === true && reply.feedback?.length, 'Cannot read native possessions');
          fields[field] = reply.feedback;
        }
      }
      return fields;
    }
    const before = await equipment();
    assert(original.mainHand?.empty || Object.values(before).some(Boolean), 'Held item has no readable native equipment');
    observed.equipment = { before };
    observed.ready = await state();
    assertInspectionWorld(observed.ready, context);
    const ready = petIn(observed.ready);
    assert(ready?.health > 0 && ready.tameable?.ownedByPlayer, 'Original live owned pet changed before care');
    observed.command = await read(`execute as ${petUuid} if entity @s[type=${TYPE},tag=${fixtureTag},nbt=!{Health:0.0f}] run data merge entity @s {Hunger:0,Potty:0,Health:${original.maxHealth}f}`);
    observed.after = await state();
    assertInspectionWorld(observed.after, context);
    let cared = petIn(observed.after);
    // /data merge reloads saved leash data. The native holder UUID resolves on the next entity tick.
    // Wait only for that observed transient state; never attach a new leash or replace a missing pet.
    if (original.leash?.leashed && cared?.leash?.leashed === false) {
      observed.leashRestore = { initial: observed.after, polls: [] };
      const deadline = Date.now() + 1000;
      for (let attempt = 0; attempt < 20 && Date.now() < deadline && cared?.leash?.leashed === false; attempt++) {
        assert(cared.health > 0 && cared.tameable?.ownedByPlayer, 'Original live pet changed during leash restoration');
        await new Promise(resolve => setTimeout(resolve, 50));
        observed.after = await state();
        assertInspectionWorld(observed.after, context);
        cared = petIn(observed.after);
        observed.leashRestore.polls.push({ tickCount: observed.after.tickCount, uuid: cared?.uuid, leash: cared?.leash });
      }
    }
    assert(cared?.uuid === original.uuid && cared.tameable?.ownedByPlayer, 'Care lost the original pet');
    assert(cared.health === original.maxHealth && cared.custom.needs.hunger === 0 && cared.custom.needs.potty === 0, 'Care did not leave a fed healthy pet');
    assert.deepEqual(cared.mainHand, original.mainHand, 'Care changed held possessions');
    assert.equal(cared.custom.harness, original.custom.harness, 'Care changed the harness');
    assert.deepEqual(cared.leash, original.leash, 'Care changed the leash');
    assert.deepEqual(cared.vehicle, original.vehicle, 'Care changed the mounted vehicle');
    observed.equipment.after = await equipment();
    assert.deepEqual(observed.equipment.after, before, 'Care changed native item components');
    return observed;
  } catch (error) { error.observed = observed; throw error; }
}

// Preserve the original exception/report if ordinary world reset also fails after an interrupted or failed run.
async function withWorldReset({ run, reset, reportFile, onResetError = (error) => console.error(`World reset also failed: ${error.message}`) }) {
  let attempted = false;
  let report;
  let primaryError;
  const resetOnce = async () => { attempted = true; return reset(report); };
  try { report = await run(resetOnce); return report; }
  catch (error) { primaryError = error; throw error; }
  finally {
    if (!attempted) {
      try { await resetOnce(); }
      catch (error) {
        if (report) {
          report.worldReset = { status: 'failed', error: error.message };
          report.ok = false;
          saveReport(reportFile, report);
        } else if (primaryError) {
          primaryError.worldResetError = error.message;
          onResetError(error);
        } else throw error;
      }
    }
  }
}

module.exports = { assertInspectionWorld, careForSuccessfulPet, withWorldReset };
