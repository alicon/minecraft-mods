'use strict';

const assert = require('node:assert/strict');
const { assertTestWorld } = require('./yorkie-world');
const TYPE = 'mushroom_yorkie:mushroom_yorkie';

function assertInspectionWorld(snapshot, { expectedSave, playerUuid }) {
  assertTestWorld(snapshot, expectedSave);
  assert(snapshot.players[0].dimension.includes('minecraft:overworld'), 'Inspection requires the original Overworld');
  assert.equal(snapshot.players[0].uuid, playerUuid, 'Inspection player changed');
}

async function careForSuccessfulPet(context) {
  const { state, request, petUuid } = context;
  const observed = {};
  try {
    assert.match(petUuid || '', /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i, 'Missing original fixture UUID');
    const petIn = (snapshot) => snapshot.players[0].nearbyEntities.find((e) => e.type === TYPE && e.uuid === petUuid);
    observed.before = await state();
    assertInspectionWorld(observed.before, context);
    const original = petIn(observed.before);
    assert(original?.health > 0 && original.tameable?.ownedByPlayer, 'Original live owned pet is not observable; refusing replacement');
    assert(Number.isFinite(original.maxHealth) && original.maxHealth > 0 && original.maxHealth <= 1024, 'Invalid pet maximum health');
    const read = (command) => request('/command', { command }, true);
    const tagged = await read(`execute as ${petUuid} if entity @s[type=${TYPE},tag=matrix_yorkie] run data get entity @s UUID`);
    assert.equal(tagged.success, true, 'Original pet is not a tagged matrix fixture');
    async function equipment(field) {
      const reply = await read(`data get entity ${petUuid} ${field}`);
      assert(!reply.feedbackTruncated, 'Cannot verify truncated equipment');
      return reply;
    }
    // Native equipment includes item components. Older target schemas use HandItems instead.
    let field = 'equipment';
    let before = await equipment(field);
    if (before.success === false) { field = 'HandItems'; before = await equipment(field); }
    assert(before.success === true && before.feedback?.length, 'Cannot read native possessions');
    observed.equipment = { field, before: before.feedback };
    assertInspectionWorld(await state(), context);
    observed.command = await read(`execute as ${petUuid} if entity @s[type=${TYPE},tag=matrix_yorkie] run data merge entity @s {Hunger:0,Potty:0,Health:${original.maxHealth}f}`);
    observed.after = await state();
    assertInspectionWorld(observed.after, context);
    const cared = petIn(observed.after);
    assert(cared?.uuid === original.uuid && cared.tameable?.ownedByPlayer, 'Care lost the original pet');
    assert(cared.health === original.maxHealth && cared.custom.needs.hunger === 0 && cared.custom.needs.potty === 0, 'Care did not leave a fed healthy pet');
    assert.deepEqual(cared.mainHand, original.mainHand, 'Care changed held possessions');
    assert.equal(cared.custom.harness, original.custom.harness, 'Care changed the harness');
    const after = await equipment(field);
    assert.equal(after.success, true, 'Cannot verify native possessions after care');
    observed.equipment.after = after.feedback;
    assert.deepEqual(after.feedback, before.feedback, 'Care changed native item components');
    return observed;
  } catch (error) { error.observed = observed; throw error; }
}

module.exports = { assertInspectionWorld, careForSuccessfulPet };
