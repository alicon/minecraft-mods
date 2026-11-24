'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runSmokeWithCare, stageSmokeShelter, stageSmokeYorkie } = require('./yorkie-smoke-runner');
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

test('steep player pitch cannot shift the smoke spawn below its audited floor', async () => {
  const type = 'mushroom_yorkie:mushroom_yorkie';
  const arena = { base: { x: -66, y: 236, z: 122 }, radius: 6 };
  const position = { x: -65.5, y: 236, z: 125.5 };
  const original = { type, uuid: 'previous-yorkie' };
  const pet = { type, uuid: UUID, position, health: 12, maxHealth: 12, inWater: false, noGravity: false };
  const snapshots = [[original], [original, { ...pet, onGround: false }], [original, { ...pet, onGround: true }]];
  const reads = [];
  const commands = [];
  const result = await stageSmokeYorkie(arena, { type, distance: 3, inspectionPet: true }, {
    state: async () => ({ players: [{ rotation: [-90, 54.46], nearbyEntities: snapshots.shift() }] }),
    blockAt: async pos => {
      reads.push(pos);
      return { block: pos.y === 235 ? 'minecraft:grass_block' : 'minecraft:air' };
    },
    command: async command => { commands.push(command); return { success: true }; }
  });
  assert.deepEqual(reads, [{ x: -66, y: 235, z: 125 }, { x: -66, y: 236, z: 125 }]);
  assert.deepEqual(commands, ['summon mushroom_yorkie:mushroom_yorkie -65.5 236 125.5 {Tags:["runtime_smoke_yorkie"]}']);
  assert.equal(result.uuid, UUID);
  assert.equal(result.onGround, true);
  assert.deepEqual(result.spawnSupport.position, position);
});

test('unsafe smoke spawn is a setup failure with useful evidence', async () => {
  const type = 'mushroom_yorkie:mushroom_yorkie';
  const arena = { base: { x: 0, y: 236, z: 0 }, radius: 6 };
  for (const badFloor of [true, false]) {
    let summoned = false;
    const context = {
      state: async () => ({ players: [{ nearbyEntities: summoned ? [{
        type, uuid: UUID, health: 12, maxHealth: 12, position: { x: 0.5, y: 233.84, z: 3.5 }
      }] : [] }] }),
      blockAt: async pos => ({ block: pos.y === 235 && !badFloor ? 'minecraft:grass_block' : 'minecraft:air' }),
      command: async () => { summoned = true; return { success: true }; }
    };
    await assert.rejects(stageSmokeYorkie(arena, { type, distance: 3 }, context), error => {
      assert.equal(error.phase, 'setup');
      assert.match(error.message, badFloor ? /floor is missing/ : /left its planned floor cell/);
      assert.equal(error.observed.position.y, 236);
      if (!badFloor) assert.equal(error.observed.pet.position.y, 233.84);
      return true;
    });
    assert.equal(summoned, !badFloor);
  }
});

test('smoke shelter waits for the original Yorkie to land and anchors walls to the native roof cell', async () => {
  const arena = { base: { x: -63, y: 268, z: 125 }, radius: 6 };
  const settled = {
    uuid: UUID, health: 12, maxHealth: 12, onGround: true,
    position: { x: -62, y: 268, z: 127.89 }, velocity: { x: 0, z: 0 },
    tameable: { ownedByPlayer: true, orderedToSit: true, sittingPose: true }
  };
  const airborne = { ...settled, onGround: false, position: { x: -62.22, y: 268.1, z: 128.32 } };
  const observations = [['10', airborne], ['11', settled], ['11', settled], ['12', settled], ['13', settled], ['14', settled]];
  const walls = [];
  const placements = await stageSmokeShelter(arena, UUID, {
    state: async () => {
      const [overworldGameTime, pet] = observations.shift();
      return { overworldGameTime, players: [{ position: { x: -62.5, z: 125.5 }, nearbyEntities: [pet] }] };
    },
    setBlockNearYorkie: async request => {
      assert.equal(observations.length, 2);
      assert.deepEqual(request, { dx: 0, dy: 3, dz: 0, block: 'minecraft:oak_planks', replace: 'minecraft:air' });
      return { changed: true, position: { x: -63, y: 271, z: 127 }, target: settled };
    },
    setAbsoluteBlock: async (position, block, replace) => {
      assert.equal(block, 'minecraft:oak_planks');
      assert.equal(replace, 'minecraft:air');
      walls.push(position);
      return { changed: true, position };
    }
  });
  assert.equal(placements.length, 10);
  assert.deepEqual(walls.filter(position => position.y === 268), [
    { x: -61, y: 268, z: 127 }, { x: -65, y: 268, z: 127 },
    { x: -63, y: 268, z: 129 }
  ]);
});

test('a shelter blocked at placement is a setup failure with the attempted block recorded', async () => {
  const arena = { base: { x: 0, y: 268, z: 0 }, radius: 6 };
  const pet = {
    uuid: UUID, health: 12, maxHealth: 12, onGround: true,
    position: { x: 0.5, y: 268, z: 3.5 }, velocity: { x: 0, z: 0 },
    tameable: { ownedByPlayer: true, orderedToSit: true, sittingPose: true }
  };
  const roof = { changed: false, position: { x: 0, y: 271, z: 3 }, previousBlock: 'minecraft:stone', target: pet };
  let tick = 0;
  await assert.rejects(stageSmokeShelter(arena, UUID, {
    state: async () => ({ overworldGameTime: String(++tick), players: [{ nearbyEntities: [pet] }] }),
    setBlockNearYorkie: async () => roof,
    setAbsoluteBlock: async () => assert.fail('walls should not be placed')
  }), error => {
    assert.equal(error.phase, 'setup');
    assert.match(error.message, /roof was blocked/);
    assert.deepEqual(error.observed.placements, [roof]);
    return true;
  });
});
