'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runSmokeWithCare } = require('./yorkie-smoke-runner');
const UUID = '00000000-0000-4000-8000-000000000050';

function fixture(options = {}) {
  const pet = { uuid: UUID, type: 'mushroom_yorkie:mushroom_yorkie', health: 6, maxHealth: 12,
    tameable: { ownedByPlayer: true }, mainHand: { id: 'minecraft:bone', count: 2 },
    leash: { leashed: true, holderId: 19, holderName: 'owner' },
    custom: { harness: true, needs: { hunger: 91, potty: 0 } } };
  const snapshot = { saveName: 'Codex Runtime Test', singleplayer: true,
    players: [{ uuid: 'owner', dimension: 'minecraft:overworld', nearbyEntities: [pet] }] };
  const commands = [];
  const gameplay = { ok: true, scenario: 'yorkie-smoke', entity: pet.type, inspectionPetUuid: UUID,
    screenshot: 'original.png', steps: [{ name: 'original need', ok: true, value: { target: pet } }] };
  const context = { expectedSave: snapshot.saveName,
    state: async () => structuredClone(snapshot),
    request: async (route, { command }) => {
      assert.equal(route, '/command'); commands.push(command);
      if (command.includes('run data merge')) {
        options.beforeCare?.();
        pet.health = 12; pet.custom.needs.hunger = 0; pet.custom.needs.potty = 0;
        if (options.breakLeash) pet.leash = { leashed: false };
      }
      return { success: true, feedback: ['bone count2 custom_name="Keep me"'] };
    },
    runSmoke: async ({ beforeStep, onStep }) => {
      await beforeStep(); onStep(gameplay.steps);
      options.afterCheckpoint?.();
      if (options.fail) throw Error('gameplay interrupted');
      return gameplay;
    }
  };
  return { pet, snapshot, commands, gameplay, context };
}

async function inReport(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-care-'));
  try { return await run(path.join(directory, 'report.json')); }
  finally { fs.rmSync(directory, { recursive: true }); }
}

test('runtime care follows durable original steps and keeps flat report compatibility', async () => inReport(async reportFile => {
  const f = fixture({ beforeCare: () => {
    const saved = JSON.parse(fs.readFileSync(reportFile));
    assert.equal(saved.gameplayOk, true); assert.equal(saved.complete, false);
    assert.equal(saved.cases[0].observed.steps[0].value.target.custom.needs.hunger, 91);
  } });
  const r = await runSmokeWithCare({ ...f.context, reportFile });
  assert.equal(r.ok, true); assert.equal(r.gameplayOk, true); assert.equal(r.postRun.status, 'passed');
  assert.equal(r.steps[0].value.target.custom.needs.hunger, 91); assert.equal(f.pet.custom.needs.hunger, 0);
  assert.equal(r.screenshot, 'original.png'); assert.deepEqual(r.steps, r.cases[0].observed.steps);
  assert.equal(r.postRun.observed.after.players[0].nearbyEntities[0].uuid, UUID);
  assert.equal(f.pet.mainHand.count, 2); assert.equal(f.pet.custom.harness, true); assert.equal(f.pet.leash.leashed, true);
  assert(f.commands.some(command => command.includes('tag=runtime_smoke_yorkie,nbt=!{Health:0.0f}') && command.includes('data merge')));
  assert.deepEqual(JSON.parse(fs.readFileSync(reportFile)), JSON.parse(JSON.stringify(r)));
}));

test('interrupted smoke checkpoints partial steps and never starts care', async () => inReport(async reportFile => {
  const f = fixture({ fail: true, afterCheckpoint: () => {
    const saved = JSON.parse(fs.readFileSync(reportFile));
    assert.equal(saved.complete, false); assert.equal(saved.cases[0].status, 'running');
    assert.equal(saved.cases[0].observed.steps.length, 1);
  } });
  const r = await runSmokeWithCare({ ...f.context, reportFile });
  assert.equal(r.ok, false); assert.equal(r.gameplayOk, false); assert.equal(r.postRun.status, 'skipped');
  assert.equal(r.steps.length, 1); assert.equal(f.commands.length, 0);
  assert.match(r.cases[0].error, /interrupted/);
}));

test('leash-changing care fails overall without rewriting passing gameplay', async () => {
  const f = fixture({ breakLeash: true });
  const r = await runSmokeWithCare(f.context);
  assert.equal(r.gameplayOk, true); assert.equal(r.cases[0].status, 'passed'); assert.equal(r.ok, false);
  assert.equal(r.postRun.status, 'failed'); assert.match(r.postRun.error, /leash/);
  assert.equal(r.steps[0].value.target.custom.needs.hunger, 91);
});

test('runtime smoke rejects unsafe worlds before invoking gameplay or care', async () => {
  for (const change of [s => { s.saveName = 'Family'; }, s => { s.singleplayer = false; },
    s => { s.players.push(s.players[0]); }, s => { s.players[0].dimension = 'minecraft:the_nether'; }]) {
    const f = fixture(); change(f.snapshot);
    let called = false; f.context.runSmoke = async () => { called = true; };
    const r = await runSmokeWithCare(f.context);
    assert.equal(r.cases[0].status, 'setup_failed'); assert.equal(called, false); assert.equal(f.commands.length, 0);
  }
});

test('missing original runtime UUID fails care without selecting a replacement', async () => {
  const f = fixture(); delete f.gameplay.inspectionPetUuid;
  const r = await runSmokeWithCare(f.context);
  assert.equal(r.gameplayOk, true); assert.equal(r.ok, false); assert.equal(r.postRun.status, 'failed');
  assert.equal(f.commands.length, 0);
});
