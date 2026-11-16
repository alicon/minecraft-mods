'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { careForSuccessfulPet } = require('./yorkie-post-run');
const { runCases } = require('./scenario-runner');
const PET = '00000000-0000-4000-8000-000000000001';

function fixture(options = {}) {
  let changed = false;
  let reads = 0;
  const commands = [];
  const pet = { uuid: PET, type: 'mushroom_yorkie:mushroom_yorkie', health: 6, maxHealth: 12,
    tameable: { ownedByPlayer: true }, mainHand: { id: 'minecraft:bone', count: 2 },
    custom: { harness: true, needs: { hunger: 90, potty: 30 } }, leash: { leashed: true, holderId: 19, holderName: 'owner' } };
  const snapshot = { saveName: 'Codex Care Test', singleplayer: true, players: [{ uuid: 'owner', dimension: 'minecraft:overworld', nearbyEntities: [pet] }] };
  return { commands, snapshot, pet, context: {
    expectedSave: snapshot.saveName, playerUuid: 'owner', petUuid: PET,
    state: async () => {
      const result = structuredClone(snapshot);
      reads++;
      if (options.switchWorld && reads === 2) result.saveName = 'Family';
      if (options.diesBeforeMerge && reads === 2) result.players[0].nearbyEntities[0].health = 0;
      if (options.ownerChanges && reads === 2) result.players[0].nearbyEntities[0].tameable.ownedByPlayer = false;
      if (options.pendingNativeLeash && changed && reads === 3) result.players[0].nearbyEntities[0].leash = { leashed: false };
      if (options.worldDuringLeashRestore && changed && reads === 4) result.saveName = 'Family';
      return result;
    },
    request: async (route, { command }) => {
      assert.equal(route, '/command'); commands.push(command);
      if (command.includes('run data merge')) {
        changed = true; pet.health = 12; pet.custom.needs = { hunger: 0, potty: 0 };
        return { success: true };
      }
      if (command.includes('if entity @s[type=')) return { success: !options.untagged };
      if (command.startsWith('execute unless data')) return { success: !options.absenceError, result: 1 };
      if (options.emptyEquipment) return { success: false };
      return { success: true, feedbackTruncated: !!options.truncated,
        feedback: [changed && options.changeEquipment ? 'different bone' : 'bone count2 custom_name="Carry me"'] };
    }
  } };
}

const mergeCommands = (f) => f.commands.filter((s) => s.includes('data merge'));

test('success-only care follows persisted original verdicts and preserves pet/items', async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-care-'));
  try {
    const reportFile = path.join(folder, 'report.json');
    const f = fixture();
    const original = structuredClone(f.pet);
    const report = await runCases([{ name: 'hungry pet', setup: async () => {}, run: async () => original }], {
      reportFile, afterSuccess: async () => {
        const saved = JSON.parse(fs.readFileSync(reportFile));
        assert.equal(saved.gameplayOk, true); assert.equal(saved.complete, false);
        assert.equal(saved.cases[0].observed.custom.needs.hunger, 90);
        return careForSuccessfulPet(f.context);
      }
    });
    assert.equal(report.ok, true); assert.equal(report.postRun.status, 'passed');
    assert.equal(report.cases[0].observed.custom.needs.hunger, 90);
    assert.equal(report.postRun.observed.after.players[0].nearbyEntities[0].custom.needs.hunger, 0);
    assert.equal(f.pet.uuid, PET); assert.equal(f.pet.mainHand.count, 2); assert.equal(f.pet.custom.harness, true);
    assert.equal(mergeCommands(f).length, 1);
    assert(mergeCommands(f)[0].includes(`execute as ${PET} if entity @s[type=mushroom_yorkie:mushroom_yorkie,tag=matrix_yorkie,nbt=!{Health:0.0f}]`));
    assert.deepEqual(JSON.parse(fs.readFileSync(reportFile)), JSON.parse(JSON.stringify(report)));
  } finally { fs.rmSync(folder, { recursive: true }); }
});

test('failed gameplay and interrupted runs never invoke success care', async () => {
  let calls = 0;
  const options = { afterSuccess: async () => { calls++; } };
  const report = await runCases([{ name: 'failed', setup: async () => {}, run: async () => { throw Error('behavior'); } }], options);
  assert.equal(report.postRun.status, 'skipped'); assert.equal(calls, 0);
  await assert.rejects(runCases([{ name: 'done', setup: async () => {}, run: async () => ({}) }],
    { ...options, onResult: () => { throw Error('interrupted'); } }), /interrupted/);
  assert.equal(calls, 0);
});

test('care failure fails overall run without rewriting successful gameplay', async () => {
  const f = fixture({ changeEquipment: true });
  const report = await runCases([{ name: 'passed', setup: async () => {}, run: async () => ({ alive: true }) }],
    { afterSuccess: () => careForSuccessfulPet(f.context) });
  assert.equal(report.gameplayOk, true); assert.equal(report.ok, false); assert.equal(report.complete, true);
  assert.deepEqual(report.summary, { passed: 1 }); assert.equal(report.cases[0].status, 'passed');
  assert.equal(report.postRun.status, 'failed'); assert.match(report.postRun.error, /native item components/);
  assert(report.postRun.observed.after);
});

test('care refuses changed world/player/dimension and multiplayer before commands', async () => {
  for (const change of [
    (s) => { s.saveName = 'Family'; }, (s) => { s.singleplayer = false; },
    (s) => { s.players.push(s.players[0]); }, (s) => { s.players[0].uuid = 'other'; },
    (s) => { s.players[0].dimension = 'minecraft:the_nether'; }
  ]) {
    const f = fixture(); change(f.snapshot);
    await assert.rejects(careForSuccessfulPet(f.context)); assert.equal(f.commands.length, 0);
  }
});

test('care refuses missing/dead/unowned/untagged pets and truncated equipment', async () => {
  for (const option of ['missing', 'dead', 'unowned', 'untagged', 'truncated']) {
    const f = fixture({ [option]: true });
    if (option === 'missing') f.snapshot.players[0].nearbyEntities = [];
    if (option === 'dead') f.pet.health = 0;
    if (option === 'unowned') f.pet.tameable.ownedByPlayer = false;
    await assert.rejects(careForSuccessfulPet(f.context)); assert.equal(mergeCommands(f).length, 0);
  }
});

test('care checks world again immediately before its only mutation', async () => {
  const f = fixture({ switchWorld: true });
  await assert.rejects(careForSuccessfulPet(f.context), /expected-save/);
  assert.equal(mergeCommands(f).length, 0);
});


test('empty native equipment requires explicit successful absence proofs', async () => {
  const f = fixture({ emptyEquipment: true }); f.pet.mainHand = { id: 'minecraft:air', count: 0, empty: true };
  const result = await careForSuccessfulPet(f.context);
  assert.deepEqual(result.equipment.before, { equipment: null, HandItems: null });
  assert.equal(mergeCommands(f).length, 1);
  const bad = fixture({ emptyEquipment: true, absenceError: true }); bad.pet.mainHand = { empty: true };
  await assert.rejects(careForSuccessfulPet(bad.context), /missing equipment/);
  assert.equal(mergeCommands(bad).length, 0);
});

test('an explicitly pet-free fixture can skip care without failing gameplay', async () => {
  const { transitionCases } = require('./yorkie-transitions');
  assert.equal(transitionCases({}).find((c) => c.name === 'squirrel-clear-tree-face').inspectionPet, false);
  const report = await runCases([{ name: 'squirrel', setup: async () => {}, run: async () => ({ tree: true }) }],
    { afterSuccess: async () => ({ skipped: true, reason: 'final_fixture_intentionally_has_no_pet' }) });
  assert.equal(report.ok, true); assert.equal(report.postRun.status, 'skipped'); assert.equal(report.gameplayOk, true);
});

test('world reset failure preserves completed failed case evidence and original interruption', async () => {
  const { withWorldReset } = require('./yorkie-post-run');
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-reset-'));
  try {
    const reportFile = path.join(folder, 'report.json');
    const report = await withWorldReset({ reportFile, reset: async () => { throw Error('world changed'); },
      run: () => runCases([{ name: 'bug', setup: async () => {}, run: async () => { throw Error('behavior'); } }], { reportFile }) });
    assert.equal(report.ok, false); assert.equal(report.cases[0].error, 'behavior'); assert.equal(report.worldReset.error, 'world changed');
    assert.equal(JSON.parse(fs.readFileSync(reportFile)).cases[0].error, 'behavior');
    const original = Error('interrupted'); let secondary;
    await assert.rejects(withWorldReset({ run: async () => { throw original; }, reset: async () => { throw Error('reset failed'); },
      onResetError: (error) => { secondary = error; } }), (error) => error === original && error.worldResetError === 'reset failed');
    assert.equal(secondary.message, 'reset failed');
  } finally { fs.rmSync(folder, { recursive: true }); }
});


test('care rechecks live ownership immediately before its mutation', async () => {
  for (const option of ['diesBeforeMerge', 'ownerChanges']) {
    const f = fixture({ [option]: true });
    await assert.rejects(careForSuccessfulPet(f.context), /changed before care/);
    assert.equal(mergeCommands(f).length, 0);
  }
});

test('care refuses unrecognized selector tags before native commands', async () => {
  const f = fixture();
  await assert.rejects(careForSuccessfulPet({ ...f.context, fixtureTag: 'arbitrary' }), /Unsupported care fixture tag/);
  assert.equal(f.commands.length, 0);
});


test('native delayed leash restoration is observed without reattaching or changing the holder', async () => {
  const f = fixture({ pendingNativeLeash: true });
  const r = await careForSuccessfulPet(f.context);
  assert.equal(r.leashRestore.initial.players[0].nearbyEntities[0].leash.leashed, false);
  assert.equal(r.leashRestore.polls.length, 1);
  assert.deepEqual(r.after.players[0].nearbyEntities[0].leash, f.pet.leash);
  assert.equal(mergeCommands(f).length, 1);
});

test('a changed world during leash hydration fails instead of retrying there', async () => {
  const f = fixture({ pendingNativeLeash: true, worldDuringLeashRestore: true });
  await assert.rejects(careForSuccessfulPet(f.context), /expected-save/);
  assert.equal(mergeCommands(f).length, 1);
});
